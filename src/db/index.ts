import { Pool } from 'pg';

let pool: Pool | null = null;

export async function getUserByTgId(p: Pool, tgId: string): Promise<{ user_id: string } | null> {
  const r = await p.query<{ user_id: string }>('SELECT user_id FROM users WHERE tg_id = $1 LIMIT 1', [tgId]);
  return r.rows[0] ?? null;
}

export async function getUserByMaxId(p: Pool, maxId: string): Promise<{ user_id: string } | null> {
  const r = await p.query<{ user_id: string }>('SELECT user_id FROM users WHERE max_id = $1 LIMIT 1', [maxId]);
  return r.rows[0] ?? null;
}

export async function markOnboarded(p: Pool, userId: string): Promise<void> {
  await p.query('UPDATE users SET onboarded_at = NOW() WHERE user_id = $1', [userId]);
}

export async function countRows(
  p: Pool,
  query: string,
  params: unknown[] = []
): Promise<number> {
  const r = await p.query<{ c: number }>(query, params);
  return r.rows[0]?.c ?? 0;
}

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    pool = new Pool({ connectionString: url });
  }
  return pool;
}
