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
    await pool.query(
      'TRUNCATE events, weekly_declarations, weekly_reports, weekly_priority_changes, daily_fixations, weekly_matters, matter_switches, matter_steps, weekly_digests, rhythm_snapshots CASCADE'
    );
    await pool.query('DELETE FROM users WHERE user_id = $1 OR user_id = $2', [userId, extraUserId]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userId, 'proj-test-tg']);
  });

  function ev<T extends DomainEvent>(e: T): T {
    return e;
  }

  it('DeclarationSet upserts weekly_declarations', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    const event = ev({
      event_id: randomUUID(),
      event_type: EVENT_TYPES.DeclarationSet,
      occurred_at: new Date().toISOString(),
      actor: { id: userId, role: 'user' as const },
      subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
      payload: {
        user_id: userId,
        week_id: weekId,
        main_focus: 'mf',
        why_now: 'wn',
        week_failure: 'wf',
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
      'SELECT main_focus, why_now, week_failure, raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
      [userId, weekId]
    );
    expect(r.rows[0]).toMatchObject({
      main_focus: 'mf',
      why_now: 'wn',
      week_failure: 'wf',
      raw_post: 'raw1',
    });

    const upd = ev({
      ...event,
      event_id: randomUUID(),
      event_type: EVENT_TYPES.DeclarationSet,
      payload: { ...event.payload, raw_post: 'raw2', main_focus: 'mf2', why_now: 'wn2', source: 'manual' as const },
    });
    await projectors.handleEvent(upd);
    const r2 = await pool.query('SELECT main_focus, raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2', [
      userId,
      weekId,
    ]);
    expect(r2.rows[0]).toMatchObject({ main_focus: 'mf2', raw_post: 'raw2' });
  });

  it('legacy declaration event types still upsert weekly_declarations', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260316';
    await projectors.handleEvent({
      event_id: randomUUID(),
      event_type: 'DeclarationCreated',
      occurred_at: new Date().toISOString(),
      actor: { id: userId, role: 'user' as const },
      subject: { entity: 'WeeklyDeclaration', id: `${userId}:${weekId}` },
      payload: {
        user_id: userId,
        week_id: weekId,
        main_focus: 'legacy mf',
        why_now: 'legacy wn',
        win_result: 'legacy wr',
        week_failure: 'legacy wf',
        raw_post: 'legacy raw',
      },
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      schema_version: 1 as const,
    });

    const r = await pool.query('SELECT main_focus, raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2', [
      userId,
      weekId,
    ]);
    expect(r.rows[0]).toMatchObject({ main_focus: 'legacy mf', raw_post: 'legacy raw' });
  });

  it('ReportSet upserts weekly_reports (raw_post only)', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.ReportSet,
        occurred_at: new Date().toISOString(),
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyReport', id: `${userId}:${weekId}` },
        payload: { user_id: userId, week_id: weekId, raw_post: 'report body', source: 'initial' as const },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query('SELECT raw_post FROM weekly_reports WHERE user_id = $1 AND week_id = $2', [userId, weekId]);
    expect(r.rows[0]?.raw_post).toBe('report body');
  });

  it('legacy report event types still upsert weekly_reports', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260316';
    await projectors.handleEvent({
      event_id: randomUUID(),
      event_type: 'ReportCreated',
      occurred_at: new Date().toISOString(),
      actor: { id: userId, role: 'user' as const },
      subject: { entity: 'WeeklyReport', id: `${userId}:${weekId}` },
      payload: { user_id: userId, week_id: weekId, raw_post: 'legacy report' },
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      schema_version: 1 as const,
    });

    const r = await pool.query('SELECT raw_post FROM weekly_reports WHERE user_id = $1 AND week_id = $2', [userId, weekId]);
    expect(r.rows[0]?.raw_post).toBe('legacy report');
  });

  it('PriorityChanged upserts weekly_priority_changes', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.PriorityChanged,
        occurred_at: new Date().toISOString(),
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyPriorityChange', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          reason: 'r1',
          new_focus: 'f1',
          new_win: 'w1',
          new_failure: 'x1',
          raw_post: 'raw1',
          source: 'initial' as const,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query(
      'SELECT reason, new_focus, new_win, new_failure, raw_post FROM weekly_priority_changes WHERE user_id = $1 AND week_id = $2',
      [userId, weekId]
    );
    expect(r.rows[0]).toMatchObject({
      reason: 'r1',
      new_focus: 'f1',
      new_win: 'w1',
      new_failure: 'x1',
      raw_post: 'raw1',
    });
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
          raw_post: 'rp',
          source: 'initial' as const,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query(
      'SELECT day, had_movement, movement_branch, raw_post FROM daily_fixations WHERE user_id = $1 AND date = $2',
      [userId, date]
    );
    expect(r.rows[0]).toMatchObject({
      day: 'Вторник',
      had_movement: true,
      movement_branch: 'yes',
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

  it('MatterSet upserts weekly_matters', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.MatterSet,
        occurred_at: new Date().toISOString(),
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyMatter', id: `${userId}:${weekId}` },
        payload: {
          user_id: userId,
          week_id: weekId,
          title: 'Стomatolog',
          why_postponed: 'страшно',
          cost_of_inaction: 'боль',
          week_target: 'записаться',
          raw_post: 'raw matter',
          source: 'initial' as const,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query(
      'SELECT title, raw_post FROM weekly_matters WHERE user_id = $1 AND week_id = $2',
      [userId, weekId]
    );
    expect(r.rows[0]).toMatchObject({ title: 'Стomatolog', raw_post: 'raw matter' });
  });

  it('MatterStepSubmitted upserts matter_steps', async () => {
    const projectors = createProjectors(pool);
    const date = '2026-03-11';
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.MatterStepSubmitted,
        occurred_at: new Date().toISOString(),
        actor: { id: userId, role: 'user' },
        subject: { entity: 'MatterStep', id: `${userId}:${date}` },
        payload: {
          user_id: userId,
          date,
          day: 'Среда',
          had_movement: false,
          movement_branch: 'no',
          what_stopped: 'страх',
          avoidance: 'работа',
          tomorrow_step: 'позвонить',
          raw_post: 'step raw',
          source: 'initial' as const,
        },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query(
      'SELECT avoidance, raw_post FROM matter_steps WHERE user_id = $1 AND date = $2',
      [userId, date]
    );
    expect(r.rows[0]).toMatchObject({ avoidance: 'работа', raw_post: 'step raw' });
  });

  it('MatterDigestSet upserts weekly_digests', async () => {
    const projectors = createProjectors(pool);
    const weekId = '20260309';
    await projectors.handleEvent(
      ev({
        event_id: randomUUID(),
        event_type: EVENT_TYPES.MatterDigestSet,
        occurred_at: new Date().toISOString(),
        actor: { id: userId, role: 'user' },
        subject: { entity: 'WeeklyDigest', id: `${userId}:${weekId}` },
        payload: { user_id: userId, week_id: weekId, raw_post: 'digest body', source: 'initial' as const },
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        schema_version: 1,
      })
    );
    const r = await pool.query('SELECT raw_post FROM weekly_digests WHERE user_id = $1 AND week_id = $2', [
      userId,
      weekId,
    ]);
    expect(r.rows[0]?.raw_post).toBe('digest body');
  });
});
