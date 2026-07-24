import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import {
  hasEngineCommitmentForWeek,
  hasEngineDigestForWeek,
  hasEngineStepForLocalDate,
} from '../src/scheduler/step-notify-helpers.js';
import {
  markFocusNotifyDone,
  markLogNotifyDone,
  markRecapNotifyDone,
} from '../src/scheduler/notify-consumed.js';

const dbUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!dbUrl)('step-notify-helpers', () => {
  let pool: Pool;
  const userId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM engine_steps WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM engine_commitments WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM engine_digests WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userId, 'notify-helper-tg']);
    await pool.query('INSERT INTO user_settings (user_id, product_mode) VALUES ($1, $2)', [
      userId,
      'startup',
    ]);
  });

  it('hasEngineCommitmentForWeek / hasEngineDigestForWeek / hasEngineStepForLocalDate', async () => {
    expect(await hasEngineCommitmentForWeek(pool, userId, 'startup', '20260309')).toBe(false);
    expect(await hasEngineDigestForWeek(pool, userId, 'startup', '20260309')).toBe(false);
    expect(await hasEngineStepForLocalDate(pool, userId, 'startup', '2026-03-09')).toBe(false);

    await pool.query(
      `INSERT INTO engine_commitments (user_id, mode, week_id, title, answers, raw_post)
       VALUES ($1, 'startup', '20260309', 't', '{}', 'p')`,
      [userId]
    );
    await pool.query(
      `INSERT INTO engine_digests (user_id, mode, week_id, raw_post)
       VALUES ($1, 'startup', '20260309', 'd')`,
      [userId]
    );
    await pool.query(
      `INSERT INTO engine_steps (user_id, mode, date, day, movement_branch, answers, raw_post)
       VALUES ($1, 'startup', '2026-03-09', 'Пн', 'yes', '{}', 's')`,
      [userId]
    );

    expect(await hasEngineCommitmentForWeek(pool, userId, 'startup', '20260309')).toBe(true);
    expect(await hasEngineDigestForWeek(pool, userId, 'startup', '20260309')).toBe(true);
    expect(await hasEngineStepForLocalDate(pool, userId, 'startup', '2026-03-09')).toBe(true);
    expect(await hasEngineCommitmentForWeek(pool, userId, 'learning', '20260309')).toBe(false);
  });

  it('mark*NotifyDone updates last_* columns', async () => {
    await markFocusNotifyDone(pool, userId, '20260309');
    await markLogNotifyDone(pool, userId, '2026-03-09');
    await markRecapNotifyDone(pool, userId, '20260309');

    const r = await pool.query(
      `SELECT last_declaration_notify_week_id, last_fixation_notify_date::text AS last_fix,
              last_report_notify_week_id
       FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    expect(r.rows[0]).toMatchObject({
      last_declaration_notify_week_id: '20260309',
      last_fix: '2026-03-09',
      last_report_notify_week_id: '20260309',
    });
  });
});
