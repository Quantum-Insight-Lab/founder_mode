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

  const extraUserId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  beforeEach(async () => {
    await pool.query('TRUNCATE events, weekly_declarations, weekly_reports, daily_fixations CASCADE');
    await pool.query('DELETE FROM users WHERE user_id = $1 OR user_id = $2', [userId, extraUserId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userId, 'proj-test-tg']);
  });

  function ev<T extends DomainEvent>(e: T): T {
    return e;
  }

  it('DeclarationCreated upserts weekly_declarations', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    const event = ev({
      event_id: randomUUID(),
      event_type: EVENT_TYPES.DeclarationCreated,
      occurred_at: new Date().toISOString(),
      actor: { id: userId, role: 'user' as const },
      subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
      payload: {
        user_id: userId,
        week_id: weekId,
        main_focus: 'mf',
        win_result: 'wr',
        week_failure: 'wf',
        raw_post: 'raw1',
      },
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      schema_version: 1 as const,
    });
    await projectors.handleEvent(event);

    const r = await pool.query(
      'SELECT main_focus, win_result, week_failure, raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
      [userId, weekId]
    );
    expect(r.rows[0]).toMatchObject({
      main_focus: 'mf',
      win_result: 'wr',
      week_failure: 'wf',
      raw_post: 'raw1',
    });

    const upd = ev({
      ...event,
      event_id: randomUUID(),
      event_type: EVENT_TYPES.DeclarationUpdated,
      payload: { ...event.payload, raw_post: 'raw2', main_focus: 'mf2' },
    });
    await projectors.handleEvent(upd);
    const r2 = await pool.query('SELECT main_focus, raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2', [
      userId,
      weekId,
    ]);
    expect(r2.rows[0]).toMatchObject({ main_focus: 'mf2', raw_post: 'raw2' });
  });

  it('ReportCreated upserts weekly_reports (raw_post only)', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.ReportCreated,
        occurred_at: new Date().toISOString(),
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyReport', id: `${userId}:${weekId}` },
        payload: { user_id: userId, week_id: weekId, raw_post: 'report body' },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query('SELECT raw_post FROM weekly_reports WHERE user_id = $1 AND week_id = $2', [userId, weekId]);
    expect(r.rows[0]?.raw_post).toBe('report body');
  });

  it('FixationSubmitted upserts daily_fixations', async () => {
    const projectors = createProjectors(pool);
    const date = '2026-03-10';
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.FixationSubmitted,
        occurred_at: new Date().toISOString(),
        actor: { id: userId, role: 'user' },
        subject: { entity: 'DailyFixation', id: `${userId}:${date}` },
        payload: {
          user_id: userId,
          date,
          day: 'Вторник',
          had_movement: true,
          movement_branch: 'yes',
          what_moved: 'w',
          thought_of_day: 't',
          raw_post: 'rp',
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query(
      'SELECT day, had_movement, movement_branch, thought_of_day, raw_post FROM daily_fixations WHERE user_id = $1 AND date = $2',
      [userId, date]
    );
    expect(r.rows[0]).toMatchObject({
      day: 'Вторник',
      had_movement: true,
      movement_branch: 'yes',
      thought_of_day: 't',
      raw_post: 'rp',
    });
  });

  it('UserRegistered inserts users row for tg_id', async () => {
    const newUserId = extraUserId;
    const projectors = createProjectors(pool);
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.UserRegistered,
        occurred_at: new Date().toISOString(),
        actor: { id: newUserId, role: 'user' },
        subject: { entity: 'User', id: newUserId },
        payload: { user_id: newUserId, tg_id: 'new-tg-only' },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query('SELECT user_id, tg_id FROM users WHERE tg_id = $1', ['new-tg-only']);
    expect(r.rows[0]?.user_id).toBe(newUserId);
  });

  it('ignores unknown event type without throwing', async () => {
    const projectors = createProjectors(pool);
    const unknown = {
      event_id: randomUUID(),
      event_type: 'UnknownEvent',
      occurred_at: new Date().toISOString(),
      actor: { id: userId, role: 'user' as const },
      subject: { entity: 'X', id: 'x' },
      payload: {},
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      schema_version: 1 as const,
    };
    await expect(projectors.handleEvent(unknown as unknown as DomainEvent)).resolves.toBeUndefined();
  });
});
