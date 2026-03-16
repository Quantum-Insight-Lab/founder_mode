/**
 * Infrastructure: user's local date from user_settings (requires DB)
 */
import type { Pool } from 'pg';
import { parseTimezoneOffset } from '../domain/timezone.js';

const NIGHT_CUTOFF_HOUR = 3; // Until 03:00 local time, treat as previous day (reflection, plan, review).

/**
 * Returns user's local date (YYYY-MM-DD). Fallback to server UTC date if no timezone.
 */
export async function getUserLocalDate(userId: string, pool: Pool): Promise<string> {
  const row = await pool.query<{ timezone: string | null }>(
    'SELECT timezone FROM user_settings WHERE user_id = $1',
    [userId]
  );
  const tz = row.rows[0]?.timezone;
  const offsetMin = tz ? parseTimezoneOffset(tz) : null;
  const now = new Date();
  if (offsetMin === null) {
    return now.toISOString().slice(0, 10);
  }
  const userLocalMs = now.getTime() + offsetMin * 60 * 1000;
  return new Date(userLocalMs).toISOString().slice(0, 10);
}

/**
 * Same as getUserLocalDate but until 03:00 local time returns previous calendar day.
 * Use for reflection ("today"/"yesterday"), plan (week/day), review (week).
 */
export async function getProductLocalDate(userId: string, pool: Pool): Promise<string> {
  const row = await pool.query<{ timezone: string | null }>(
    'SELECT timezone FROM user_settings WHERE user_id = $1',
    [userId]
  );
  const tz = row.rows[0]?.timezone;
  const offsetMin = tz ? parseTimezoneOffset(tz) : null;
  const now = new Date();
  if (offsetMin === null) {
    return now.toISOString().slice(0, 10);
  }
  const userLocalMs = now.getTime() + offsetMin * 60 * 1000;
  const userLocal = new Date(userLocalMs);
  const hours = userLocal.getUTCHours();
  if (hours < NIGHT_CUTOFF_HOUR) {
    const yesterdayMs = userLocalMs - 24 * 60 * 60 * 1000;
    return new Date(yesterdayMs).toISOString().slice(0, 10);
  }
  return new Date(userLocalMs).toISOString().slice(0, 10);
}
