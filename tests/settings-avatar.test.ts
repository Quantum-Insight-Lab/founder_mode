import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { createSettingsService } from '../src/services/settings-service.js';

const dbUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!dbUrl)('settings-avatar', () => {
  let pool: Pool;
  const userId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const tgId = 'avatar-settings-user';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await pool.query(
      'INSERT INTO users (user_id, tg_id) VALUES ($1, $2) ON CONFLICT (tg_id) DO NOTHING',
      [userId, tgId]
    );
  });

  it('switches avatar mode uploaded -> messenger -> default', async () => {
    const settings = createSettingsService(pool);
    await settings.getOrCreate(userId);
    await settings.setAvatarUploaded(userId, {
      storageKey: `${userId}/avatar-${Date.now()}.webp`,
      mime: 'image/webp',
      width: 512,
      height: 512,
    });
    let pref = await settings.getAvatarPreference(userId);
    expect(pref.mode).toBe('uploaded');
    expect(pref.storageKey).toContain(`${userId}/avatar-`);
    expect(pref.mime).toBe('image/webp');

    await settings.setAvatarModeMessenger(userId);
    pref = await settings.getAvatarPreference(userId);
    expect(pref.mode).toBe('messenger');

    await settings.setAvatarModeDefault(userId);
    pref = await settings.getAvatarPreference(userId);
    expect(pref.mode).toBe('default');
    expect(pref.storageKey).toBeNull();
    expect(pref.mime).toBeNull();
  });

  it('increments avatar version when uploading new image', async () => {
    const settings = createSettingsService(pool);
    await settings.getOrCreate(userId);
    await settings.setAvatarUploaded(userId, {
      storageKey: `${userId}/${randomUUID()}.webp`,
      mime: 'image/webp',
      width: 512,
      height: 512,
    });
    const first = await settings.getOrCreate(userId);

    await settings.setAvatarUploaded(userId, {
      storageKey: `${userId}/${randomUUID()}.webp`,
      mime: 'image/webp',
      width: 512,
      height: 512,
    });
    const second = await settings.getOrCreate(userId);

    expect(second.avatar_version).toBeGreaterThan(first.avatar_version);
  });
});
