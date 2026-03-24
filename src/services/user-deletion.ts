import type { Pool } from 'pg';
import { logger } from '../observability/logger.js';

export async function deleteUserData(pool: Pool, userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const identity = await client.query<{ tg_id: string | null; max_id: string | null }>(
      'SELECT tg_id, max_id FROM users WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const tgId = identity.rows[0]?.tg_id ?? null;
    const maxId = identity.rows[0]?.max_id ?? null;
    await client.query('DELETE FROM weekly_declarations WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM weekly_reports WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM daily_fixations WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM events WHERE actor_id = $1', [userId]);
    await client.query(
      `DELETE FROM idempotency_cache 
       WHERE idempotency_key LIKE $1 OR idempotency_key LIKE $2 OR idempotency_key LIKE $3`,
      [`declaration:${userId}:%`, `report:${userId}:%`, `fixation:${userId}:%`]
    );
    if (tgId) {
      await client.query(
        'DELETE FROM idempotency_cache WHERE idempotency_key = $1',
        [`user:telegram:${tgId}`]
      );
    }
    if (maxId) {
      await client.query(
        'DELETE FROM idempotency_cache WHERE idempotency_key = $1',
        [`user:max:${maxId}`]
      );
    }
    await client.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
    logger.info({ userId }, 'User data deleted');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
