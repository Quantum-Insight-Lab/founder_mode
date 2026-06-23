import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
import { applyAllMigrations } from './apply-migrations.js';
import { deleteUserData } from '../src/services/user-deletion.js';
import { loadAvatarDataUrl, storeNormalizedAvatar } from '../src/services/avatar-storage.js';

const dbUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!dbUrl)('user-deletion', () => {
  let pool: Pool;
  const userId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM engine_steps WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM engine_digests WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM engine_commitments WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM rhythm_snapshots WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM events WHERE actor_id = $1', [userId]);
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
      `INSERT INTO engine_commitments (user_id, mode, week_id, title, answers, raw_post)
       VALUES ($1, 'learning', $2, 'f', '{}', 'p') ON CONFLICT (user_id, mode, week_id) DO NOTHING`,
      [userId, weekId]
    );

    await deleteUserData(pool, userId);

    const users = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const settings = await pool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
    const commitments = await pool.query('SELECT * FROM engine_commitments WHERE user_id = $1', [userId]);
    expect(users.rows.length).toBe(0);
    expect(settings.rows.length).toBe(0);
    expect(commitments.rows.length).toBe(0);
  });

  it('removes engine rows, events, idempotency cache rows for user', async () => {
    const weekId = '20260301';
    await pool.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    await pool.query(
      `INSERT INTO engine_commitments (user_id, mode, week_id, title, answers, raw_post)
       VALUES ($1, 'learning', $2, 'f', '{}', 'p')`,
      [userId, weekId]
    );
    await pool.query(
      `INSERT INTO engine_digests (user_id, mode, week_id, raw_post) VALUES ($1, 'learning', $2, 'rep')`,
      [userId, weekId]
    );
    await pool.query(
      `INSERT INTO engine_steps (
         user_id, mode, date, day, movement_branch, answers, raw_post
       ) VALUES ($1, 'learning', '2026-03-05', 'Чт', 'yes', '{}', 'raw')`,
      [userId]
    );
    await pool.query(
      `INSERT INTO events (
         event_id, event_type, occurred_at, actor_id, actor_role,
         subject_entity, subject_id, payload, schema_version
       ) VALUES ($1, 'DailyStepSubmitted', NOW(), $2, 'user', 'EngineStep', $3, '{}', 1)`,
      [randomUUID(), userId, `${userId}:learning:2026-03-05`]
    );
    await pool.query(
      `INSERT INTO idempotency_cache (idempotency_key, content, tokens_in, tokens_out, latency_ms, expires_at)
       VALUES ($1, 'x', 1, 1, 1, NOW() + interval '1 day')`,
      [`engine_commitment:${userId}:${weekId}`]
    );
    await pool.query(
      `INSERT INTO idempotency_cache (idempotency_key, content, tokens_in, tokens_out, latency_ms, expires_at)
       VALUES ($1, 'x', 1, 1, 1, NOW() + interval '1 day')`,
      ['user:telegram:delete-test-user']
    );
    const image = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: { r: 50, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();
    const storedAvatar = await storeNormalizedAvatar(userId, image, 'image/png');
    await pool.query(
      `UPDATE user_settings
          SET avatar_mode = 'uploaded',
              avatar_storage_key = $2,
              avatar_mime = 'image/webp',
              avatar_width = 512,
              avatar_height = 512
        WHERE user_id = $1`,
      [userId, storedAvatar.storageKey]
    );

    await deleteUserData(pool, userId);

    const ev = await pool.query('SELECT 1 FROM events WHERE actor_id = $1', [userId]);
    const steps = await pool.query('SELECT 1 FROM engine_steps WHERE user_id = $1', [userId]);
    const digests = await pool.query('SELECT 1 FROM engine_digests WHERE user_id = $1', [userId]);
    const ic = await pool.query('SELECT 1 FROM idempotency_cache WHERE idempotency_key = $1', [
      `engine_commitment:${userId}:${weekId}`,
    ]);
    const userRegKey = await pool.query('SELECT 1 FROM idempotency_cache WHERE idempotency_key = $1', [
      'user:telegram:delete-test-user',
    ]);
    const avatarAfterDelete = await loadAvatarDataUrl(storedAvatar.storageKey, 'image/webp');
    expect(ev.rows.length).toBe(0);
    expect(steps.rows.length).toBe(0);
    expect(digests.rows.length).toBe(0);
    expect(ic.rows.length).toBe(0);
    expect(userRegKey.rows.length).toBe(0);
    expect(avatarAfterDelete).toBeNull();
  });
});
