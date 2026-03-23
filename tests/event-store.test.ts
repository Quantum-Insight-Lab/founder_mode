import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createEventStore } from '../src/events/event-store.js';
import { EVENT_TYPES } from '../src/events/types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const dbUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!dbUrl)('event-store', () => {
  let pool: Pool;
  let eventStore: ReturnType<typeof createEventStore>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    const sql = readFileSync(resolve(process.cwd(), 'migrations/001_init.sql'), 'utf-8');
    await pool.query(sql);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE events CASCADE');
    eventStore = createEventStore(pool);
  });

  const baseEvent = {
    event_type: EVENT_TYPES.FixationSubmitted as const,
    actor: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'user' as const },
    subject: { entity: 'DailyReflection', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-03-09' },
    payload: { user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', date: '2026-03-09', thought_of_day: 'test' },
    causation_id: null,
    correlation_id: null,
    idempotency_key: 'test-key-123',
    schema_version: 1 as const,
  };

  it('appends event and returns it with event_id and occurred_at', async () => {
    const result = await eventStore.append(baseEvent);

    expect(result.event_id).toBeDefined();
    expect(result.occurred_at).toBeDefined();
    expect(result.event_type).toBe(EVENT_TYPES.FixationSubmitted);
    expect(result.payload).toEqual(baseEvent.payload);

    const rows = await pool.query('SELECT * FROM events WHERE event_id = $1', [result.event_id]);
    expect(rows.rows.length).toBe(1);
  });

  it('skips duplicate when idempotency_key exists (returns existing event)', async () => {
    const first = await eventStore.append(baseEvent);
    const second = await eventStore.append(baseEvent);

    expect(second.event_id).toBe(first.event_id);
    expect(second.occurred_at).toBe(first.occurred_at);

    const rows = await pool.query('SELECT * FROM events WHERE idempotency_key = $1', [
      baseEvent.idempotency_key,
    ]);
    expect(rows.rows.length).toBe(1);
  });

  it('getByIdempotencyKey returns event when exists', async () => {
    await eventStore.append(baseEvent);
    const found = await eventStore.getByIdempotencyKey('test-key-123');

    expect(found).not.toBeNull();
    expect(found!.event_type).toBe(EVENT_TYPES.FixationSubmitted);
    expect(found!.payload).toEqual(baseEvent.payload);
  });

  it('getByIdempotencyKey returns null when not exists', async () => {
    const found = await eventStore.getByIdempotencyKey('nonexistent-key');
    expect(found).toBeNull();
  });
});
