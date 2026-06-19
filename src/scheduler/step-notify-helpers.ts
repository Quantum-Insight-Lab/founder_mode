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

export async function hasEngineStepForLocalDate(
  pool: Pool,
  userId: string,
  mode: string,
  localDateYmd: string
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM engine_steps WHERE user_id = $1 AND mode = $2 AND date = $3::date LIMIT 1`,
    [userId, mode, localDateYmd]
  );
  return r.rows.length > 0;
}
