import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { hasDailyFixationForLocalDate } from '../src/scheduler/fixation-notify-helpers.js';

const dbUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!dbUrl)('fixation-notify-helpers', () => {
  let pool: Pool;
  const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const date = '2026-05-05';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE events, weekly_declarations, weekly_reports, weekly_priority_changes, daily_fixations, rhythm_snapshots CASCADE'
    );
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userId, 'fix-notify-tg']);
  });

  it('hasDailyFixationForLocalDate is false without row', async () => {
    await expect(hasDailyFixationForLocalDate(pool, userId, date)).resolves.toBe(false);
  });

  it('hasDailyFixationForLocalDate is true when row exists for date', async () => {
    await pool.query(
      `INSERT INTO daily_fixations (
        user_id, date, day, had_movement, movement_branch, raw_post, updated_at
      ) VALUES ($1, $2, 'Вторник', true, 'yes', 'x', NOW())`,
      [userId, date]
    );
    await expect(hasDailyFixationForLocalDate(pool, userId, date)).resolves.toBe(true);
  });

  it('hasDailyFixationForLocalDate ignores other users', async () => {
    const other = randomUUID();
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [other, 'other-tg']);
    await pool.query(
      `INSERT INTO daily_fixations (
        user_id, date, day, had_movement, movement_branch, raw_post, updated_at
      ) VALUES ($1, $2, 'Вторник', true, 'yes', 'x', NOW())`,
      [other, date]
    );
    await expect(hasDailyFixationForLocalDate(pool, userId, date)).resolves.toBe(false);
  });
});
