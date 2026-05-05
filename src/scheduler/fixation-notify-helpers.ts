import type { Pool } from 'pg';

/** Есть ли уже сданная фиксация на эту календарную дату (локальную для пользователя). */
export async function hasDailyFixationForLocalDate(
  pool: Pool,
  userId: string,
  localDateYmd: string
): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM daily_fixations WHERE user_id = $1 AND date = $2::date LIMIT 1`, [
    userId,
    localDateYmd,
  ]);
  return r.rows.length > 0;
}
