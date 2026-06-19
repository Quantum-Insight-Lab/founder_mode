import type { Pool } from 'pg';

export async function hasMatterStepForLocalDate(
  pool: Pool,
  userId: string,
  localDateYmd: string
): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM matter_steps WHERE user_id = $1 AND date = $2::date LIMIT 1`, [
    userId,
    localDateYmd,
  ]);
  return r.rows.length > 0;
}
