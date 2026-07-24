import type { Pool } from 'pg';

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

export async function hasEngineCommitmentForWeek(
  pool: Pool,
  userId: string,
  mode: string,
  weekId: string
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM engine_commitments WHERE user_id = $1 AND mode = $2 AND week_id = $3 LIMIT 1`,
    [userId, mode, weekId]
  );
  return r.rows.length > 0;
}

export async function hasEngineDigestForWeek(
  pool: Pool,
  userId: string,
  mode: string,
  weekId: string
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM engine_digests WHERE user_id = $1 AND mode = $2 AND week_id = $3 LIMIT 1`,
    [userId, mode, weekId]
  );
  return r.rows.length > 0;
}
