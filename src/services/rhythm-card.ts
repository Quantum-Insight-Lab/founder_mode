import type { Pool } from 'pg';
import type { MovementBranch } from '../domain/rhythm-score.js';
import { computeRhythmScore, type RhythmDay } from '../domain/rhythm-score.js';
import { lastNWeekdaysOldestFirst } from '../domain/rhythm-weekdays.js';
import { getWeekId, getPreviousWeekId } from './week-service.js';

const RHYTHM_LABEL = 'Ритм';

const RHYTHM_WINDOW_WEEKDAYS = 14;

/**
 * Строка для карточки («Ритм N») или null — не показывать, пока не было ни одного report.
 */
export async function getRhythmLineForCard(pool: Pool, userId: string, userLocalTodayYmd: string): Promise<string | null> {
  const anyReport = await pool.query('SELECT 1 FROM weekly_reports WHERE user_id = $1 LIMIT 1', [userId]);
  if (anyReport.rows.length === 0) return null;

  const end = userLocalTodayYmd;
  const windowDates = lastNWeekdaysOldestFirst(end, RHYTHM_WINDOW_WEEKDAYS);
  const start = windowDates[0]!;
  const last = windowDates[windowDates.length - 1]!;

  const rows = await pool.query<{ date: string; movement_branch: string | null }>(
    `SELECT date::text AS date, movement_branch::text AS movement_branch
     FROM daily_fixations
     WHERE user_id = $1 AND date >= $2::date AND date <= $3::date`,
    [userId, start, last]
  );
  const byDate = new Map<string, MovementBranch | null>();
  for (const r of rows.rows) {
    const br = r.movement_branch;
    if (br === 'yes' || br === 'no' || br === 'partial' || br === 'week_closed') {
      byDate.set(r.date, br);
    } else {
      byDate.set(r.date, null);
    }
  }

  const days: RhythmDay[] = windowDates.map((date) => ({
    date,
    branch: byDate.get(date) ?? null,
  }));

  const weekNow = getWeekId(userLocalTodayYmd);
  const weekPrev = getPreviousWeekId(userLocalTodayYmd);
  const reportWeek = await pool.query(
    `SELECT 1 FROM weekly_reports WHERE user_id = $1 AND week_id = ANY($2::text[]) LIMIT 1`,
    [userId, [weekNow, weekPrev]]
  );
  const hasReportCurrentOrPreviousWeek = reportWeek.rows.length > 0;

  const score = computeRhythmScore(days, hasReportCurrentOrPreviousWeek);
  return `${RHYTHM_LABEL} ${score}`;
}
