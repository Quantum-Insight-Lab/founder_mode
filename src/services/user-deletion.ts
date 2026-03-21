import type { Pool } from 'pg';
import { logger } from '../observability/logger.js';

export async function deleteUserData(pool: Pool, userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM weekly_declarations WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM weekly_plans WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM daily_reflections WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM weekly_reviews WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM events WHERE actor_id = $1', [userId]);
    await client.query(
      `DELETE FROM idempotency_cache 
       WHERE idempotency_key LIKE $1 OR idempotency_key LIKE $2 OR idempotency_key LIKE $3 OR idempotency_key LIKE $4`,
      [`declaration:${userId}:%`, `plan:${userId}:%`, `reflection:${userId}:%`, `review:${userId}:%`]
    );
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
