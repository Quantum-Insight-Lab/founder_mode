import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { createProjectors } from '../src/projectors/index.js';
import { EVENT_TYPES } from '../src/events/types.js';
import type { DomainEvent } from '../src/events/types.js';

const dbUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!dbUrl)('projectors', () => {
  let pool: Pool;
  const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE events, engine_commitments, engine_switches, engine_steps, engine_digests, rhythm_snapshots CASCADE'
    );
    await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userId, 'proj-test-tg']);
  });

  function ev<T extends DomainEvent>(e: T): T {
    return e;
  }

  it('CommitmentSet upserts engine_commitments', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    const event = ev({
      event_id: randomUUID(),
      event_type: EVENT_TYPES.CommitmentSet,
      occurred_at: new Date().toISOString(),
      actor: { id: userId, role: 'user' as const },
      subject: { entity: 'EngineCommitment', id: `${userId}:learning:${weekId}` },
      payload: {
        user_id: userId,
        mode: 'learning',
        week_id: weekId,
        title: 'TypeScript',
        answers: { why_now: 'career' },
        raw_post: 'raw1',
        source: 'initial' as const,
      },
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      schema_version: 1 as const,
    });
    await projectors.handleEvent(event);
    const r = await pool.query(
      'SELECT title, mode, raw_post FROM engine_commitments WHERE user_id = $1 AND mode = $2 AND week_id = $3',
      [userId, 'learning', weekId]
    );
    expect(r.rows[0]).toMatchObject({ title: 'TypeScript', mode: 'learning', raw_post: 'raw1' });
  });

  it('DailyStepSubmitted upserts engine_steps', async () => {
    const projectors = createProjectors(pool);
    const event = ev({
      event_id: randomUUID(),
      event_type: EVENT_TYPES.DailyStepSubmitted,
      occurred_at: new Date().toISOString(),
      actor: { id: userId, role: 'user' as const },
      subject: { entity: 'EngineStep', id: `${userId}:learning:2026-03-09` },
      payload: {
        user_id: userId,
        mode: 'learning',
        date: '2026-03-09',
        day: 'Понедельник',
        movement_branch: 'yes',
        answers: { what_moved: 'a' },
        raw_post: 'step raw',
        source: 'initial' as const,
      },
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      schema_version: 1 as const,
    });
    await projectors.handleEvent(event);
    const r = await pool.query(
      'SELECT movement_branch, raw_post FROM engine_steps WHERE user_id = $1 AND mode = $2 AND date = $3',
      [userId, 'learning', '2026-03-09']
    );
    expect(r.rows[0]).toMatchObject({ movement_branch: 'yes', raw_post: 'step raw' });
  });

  it('DigestSet upserts engine_digests', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    const event = ev({
      event_id: randomUUID(),
      event_type: EVENT_TYPES.DigestSet,
      occurred_at: new Date().toISOString(),
      actor: { id: userId, role: 'user' as const },
      subject: { entity: 'EngineDigest', id: `${userId}:learning:${weekId}` },
      payload: {
        user_id: userId,
        mode: 'learning',
        week_id: weekId,
        raw_post: 'digest raw',
        source: 'initial' as const,
      },
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      schema_version: 1 as const,
    });
    await projectors.handleEvent(event);
    const r = await pool.query(
      'SELECT raw_post FROM engine_digests WHERE user_id = $1 AND mode = $2 AND week_id = $3',
      [userId, 'learning', weekId]
    );
    expect(r.rows[0].raw_post).toBe('digest raw');
  });

  it('UserRegistered inserts users row for tg_id', async () => {
    const projectors = createProjectors(pool);
    const newUserId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.UserRegistered,
        occurred_at: new Date().toISOString(),
        actor: { id: newUserId, role: 'user' },
        subject: { entity: 'User', id: newUserId },
        payload: { user_id: newUserId, tg_id: 'new-tg' },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query('SELECT tg_id FROM users WHERE user_id = $1', [newUserId]);
    expect(r.rows[0]?.tg_id).toBe('new-tg');
  });

  it('ignores unknown event type without throwing', async () => {
    const projectors = createProjectors(pool);
    await expect(
      projectors.handleEvent({
        event_id: randomUUID(),
        event_type: 'UnknownEvent' as 'CommitmentSet',
        occurred_at: new Date().toISOString(),
        actor: { id: userId, role: 'user' },
        subject: { entity: 'X', id: 'x' },
        payload: {} as never,
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    ).resolves.toBeUndefined();
  });
});
