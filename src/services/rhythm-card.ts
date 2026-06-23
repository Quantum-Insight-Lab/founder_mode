import type { Pool } from 'pg';
import type { MovementBranch } from '../domain/rhythm-score.js';
import { computeRhythmBreakdown, type RhythmDay } from '../domain/rhythm-score.js';
import type { RhythmSnapshotRow } from '../db/row-types.js';
import { lastNWeekdaysOldestFirst } from '../domain/rhythm-weekdays.js';
import { getWeekId, getPreviousWeekId } from './week-service.js';

const RHYTHM_LABEL = 'Ритм:';
const RHYTHM_WINDOW_WEEKDAYS = 14;

/**
 * Cross-mode rhythm from engine_steps. Gate: at least one engine_digests row.
 */
export async function getRhythmLineForCard(pool: Pool, userId: string, userLocalTodayYmd: string): Promise<string | null> {
  const anyDigest = await pool.query('SELECT 1 FROM engine_digests WHERE user_id = $1 LIMIT 1', [userId]);
  if (anyDigest.rows.length === 0) return null;

  const end = userLocalTodayYmd;
  const windowDates = lastNWeekdaysOldestFirst(end, RHYTHM_WINDOW_WEEKDAYS);
  const start = windowDates[0]!;
  const last = windowDates[windowDates.length - 1]!;

  const rows = await pool.query<{ date: string; movement_branch: string }>(
    `SELECT date::text AS date, movement_branch
     FROM engine_steps
     WHERE user_id = $1 AND date >= $2::date AND date <= $3::date
     ORDER BY date, mode`,
    [userId, start, last]
  );

  const byDate = new Map<string, MovementBranch | null>();
  for (const r of rows.rows) {
    const br = r.movement_branch;
    if (br === 'yes' || br === 'no' || br === 'partial') {
      const existing = byDate.get(r.date);
      if (!existing || (existing === 'no' && br !== 'no') || (existing === 'partial' && br === 'yes')) {
        byDate.set(r.date, br);
      }
    }
  }

  const days: RhythmDay[] = windowDates.map((date) => ({
    date,
    branch: byDate.get(date) ?? null,
  }));

  const weekNow = getWeekId(userLocalTodayYmd);
  const weekPrev = getPreviousWeekId(userLocalTodayYmd);
  const digestWeek = await pool.query(
    `SELECT 1 FROM engine_digests WHERE user_id = $1 AND week_id = ANY($2::text[]) LIMIT 1`,
    [userId, [weekNow, weekPrev]]
  );
  const hasReportCurrentOrPreviousWeek = digestWeek.rows.length > 0;

  const breakdown = computeRhythmBreakdown(days, hasReportCurrentOrPreviousWeek);

  await pool.query(
    `INSERT INTO rhythm_snapshots (
      user_id, as_of_date, score, flow, completion, stability,
      has_report_current_or_previous_week, computed_at
    ) VALUES ($1, $2::date, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (user_id, as_of_date) DO UPDATE SET
      score = EXCLUDED.score,
      flow = EXCLUDED.flow,
      completion = EXCLUDED.completion,
      stability = EXCLUDED.stability,
      has_report_current_or_previous_week = EXCLUDED.has_report_current_or_previous_week,
      computed_at = NOW()`,
    [
      userId,
      userLocalTodayYmd,
      breakdown.score,
      breakdown.flow,
      breakdown.completion,
      breakdown.stability,
      hasReportCurrentOrPreviousWeek,
    ]
  );

  return `${RHYTHM_LABEL} ${breakdown.score}`;
}

export async function getRhythmSnapshotsForUser(
  pool: Pool,
  userId: string,
  fromDateYmd: string,
  toDateYmd: string
): Promise<RhythmSnapshotRow[]> {
  const res = await pool.query<RhythmSnapshotRow>(
    `SELECT user_id, as_of_date::text AS as_of_date, score,
            flow::float8 AS flow, completion::float8 AS completion,
            stability::float8 AS stability,
            has_report_current_or_previous_week, computed_at
     FROM rhythm_snapshots
     WHERE user_id = $1 AND as_of_date >= $2::date AND as_of_date <= $3::date
     ORDER BY as_of_date ASC`,
    [userId, fromDateYmd, toDateYmd]
  );
  return res.rows;
}
