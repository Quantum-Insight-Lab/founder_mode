import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { getRhythmLineForCard } from '../src/services/rhythm-card.js';
import { ENGINE_MODES } from '../src/services/product-mode.js';
import { MODE_CONFIGS } from '../src/modes/registry.js';

const dbUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!dbUrl)('rhythm-card cross-mode', () => {
  let pool: Pool;
  const userId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM engine_steps WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM engine_digests WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM rhythm_snapshots WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userId, 'rhythm-test']);
  });

  it('returns null when no digest gate', async () => {
    await pool.query(
      `INSERT INTO engine_steps (user_id, mode, date, day, movement_branch, answers, raw_post)
       VALUES ($1, 'learning', '2026-03-09', 'Пн', 'yes', '{}', 'x')`,
      [userId]
    );
    const line = await getRhythmLineForCard(pool, userId, '2026-03-09');
    expect(line).toBeNull();
  });

  it('aggregates steps across modes when digest exists', async () => {
    await pool.query(
      `INSERT INTO engine_digests (user_id, mode, week_id, raw_post) VALUES ($1, 'habit', '20260309', 'd')`,
      [userId]
    );
    await pool.query(
      `INSERT INTO engine_steps (user_id, mode, date, day, movement_branch, answers, raw_post)
       VALUES ($1, 'learning', '2026-03-09', 'Пн', 'yes', '{}', 'a')`,
      [userId]
    );
    await pool.query(
      `INSERT INTO engine_steps (user_id, mode, date, day, movement_branch, answers, raw_post)
       VALUES ($1, 'closure', '2026-03-09', 'Пн', 'partial', '{}', 'b')`,
      [userId]
    );
    const line = await getRhythmLineForCard(pool, userId, '2026-03-09');
    expect(line).toMatch(/^Ритм: \d+$/);

    const snap = await pool.query('SELECT score FROM rhythm_snapshots WHERE user_id = $1', [userId]);
    expect(snap.rows.length).toBe(1);
    expect(typeof snap.rows[0].score).toBe('number');
  });
});

describe('after-recap onboarding config', () => {
  it('all modes define afterRecapQuestion CTA text', () => {
    for (const mode of ENGINE_MODES) {
      const q = MODE_CONFIGS[mode].onboarding.afterRecapQuestion;
      expect(q.length).toBeGreaterThan(10);
      expect(q.toLowerCase()).toContain('недел');
    }
  });
});
