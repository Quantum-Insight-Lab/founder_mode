/**
 * Infrastructure: user's local date from user_settings (requires DB)
 */
import type { Pool } from 'pg';
import { parseTimezoneOffset } from '../domain/timezone.js';

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
