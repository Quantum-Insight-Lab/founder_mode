import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { deleteUserData } from '../src/services/user-deletion.js';

const dbUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;

describe.skipIf(!dbUrl)('user-deletion', () => {
  let pool: Pool;
  const userId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    const sql = readFileSync(resolve(process.cwd(), 'migrations/001_init.sql'), 'utf-8');
    await pool.query(sql);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await pool.query(
      'INSERT INTO users (user_id, tg_id) VALUES ($1, $2) ON CONFLICT (tg_id) DO NOTHING',
      [userId, 'delete-test-user']
    );
  });

  it('deletes all user data', async () => {
    await pool.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const weekId = '20260308';
    await pool.query(
      `INSERT INTO weekly_plans (user_id, week_id, main_focus, weekly_result, raw_post)
       VALUES ($1, $2, 'f', 'r', 'p') ON CONFLICT (user_id, week_id) DO NOTHING`,
      [userId, weekId]
    );

    await deleteUserData(pool, userId);

    const users = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const settings = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
    const plans = await pool.query('SELECT * FROM weekly_plans WHERE user_id = $1', [userId]);
    expect(users.rows.length).toBe(0);
    expect(settings.rows.length).toBe(0);
    expect(plans.rows.length).toBe(0);
  });
});
