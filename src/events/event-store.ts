import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { DomainEvent } from './types.js';
import type { EventsRow } from '../db/row-types.js';
import { logger } from '../observability/logger.js';

function rowToDomainEvent(row: EventsRow): DomainEvent {
  const occurredAt =
    row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at);
  return {
    event_id: row.event_id,
    event_type: row.event_type as DomainEvent['event_type'],
    occurred_at: occurredAt,
    actor: { id: row.actor_id, role: ((row.actor_role ?? 'user') as 'user') },
    subject: { entity: row.subject_entity, id: row.subject_id },
    payload: row.payload as DomainEvent['payload'],
    causation_id: row.causation_id as string | null,
    correlation_id: row.correlation_id as string | null,
    idempotency_key: row.idempotency_key as string | null,
    schema_version: row.schema_version as 1,
  } as DomainEvent;
}

export interface EventStore {
  append(event: Omit<DomainEvent, 'event_id' | 'occurred_at'>): Promise<DomainEvent>;
  appendMany(events: Omit<DomainEvent, 'event_id' | 'occurred_at'>[]): Promise<DomainEvent[]>;
  getByIdempotencyKey(key: string): Promise<DomainEvent | null>;
}

export function createEventStore(pool: Pool): EventStore {
  return {
    async append(partial) {
      if (partial.idempotency_key) {
        const existing = await this.getByIdempotencyKey(partial.idempotency_key);
        if (existing) {
          logger.debug(
            { event_type: partial.event_type, idempotency_key: partial.idempotency_key },
            'Event store: skip duplicate'
          );
          return existing;
        }
      }
      const event = {
        ...partial,
        event_id: randomUUID(),
        occurred_at: new Date().toISOString(),
      } as DomainEvent;
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO events (
            event_id, event_type, occurred_at, actor_id, actor_role,
            subject_entity, subject_id, payload, causation_id, correlation_id,
            idempotency_key, schema_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            event.event_id,
            event.event_type,
            event.occurred_at,
            event.actor.id,
            event.actor.role,
            event.subject.entity,
            event.subject.id,
            JSON.stringify(event.payload),
            event.causation_id,
            event.correlation_id,
            event.idempotency_key,
            event.schema_version,
          ]
        );
        logger.debug(
          { event_type: event.event_type, event_id: event.event_id, idempotency_key: event.idempotency_key },
          'Event store: appended'
        );
        return event;
      } finally {
        client.release();
      }
    },

    async appendMany(partials) {
      const client = await pool.connect();
      try {
        const results: DomainEvent[] = [];
        const toInsert: DomainEvent[] = [];

        for (const p of partials) {
          if (p.idempotency_key) {
            const existing = await client.query<EventsRow>(
              `SELECT event_id, event_type, occurred_at, actor_id, actor_role, subject_entity, subject_id,
                      payload, causation_id, correlation_id, idempotency_key, schema_version
               FROM events WHERE idempotency_key = $1 LIMIT 1`,
              [p.idempotency_key]
            );
            if (existing.rows.length > 0) {
              results.push(rowToDomainEvent(existing.rows[0]));
              continue;
            }
          }
          const event = {
            ...p,
            event_id: randomUUID(),
            occurred_at: new Date().toISOString(),
          } as DomainEvent;
          toInsert.push(event);
          results.push(event);
        }

        await client.query('BEGIN');
        try {
          for (const event of toInsert) {
            await client.query(
              `INSERT INTO events (
                event_id, event_type, occurred_at, actor_id, actor_role,
                subject_entity, subject_id, payload, causation_id, correlation_id,
                idempotency_key, schema_version
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                event.event_id,
                event.event_type,
                event.occurred_at,
                event.actor.id,
                event.actor.role,
                event.subject.entity,
                event.subject.id,
                JSON.stringify(event.payload),
                event.causation_id,
                event.correlation_id,
                event.idempotency_key,
                event.schema_version,
              ]
            );
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
        return results;
      } finally {
        client.release();
      }
    },

    async getByIdempotencyKey(key: string): Promise<DomainEvent | null> {
      const result = await pool.query<EventsRow>(
        `SELECT event_id, event_type, occurred_at, actor_id, actor_role, subject_entity, subject_id,
                payload, causation_id, correlation_id, idempotency_key, schema_version
         FROM events WHERE idempotency_key = $1 LIMIT 1`,
        [key]
      );
      if (result.rows.length === 0) return null;
      return rowToDomainEvent(result.rows[0]);
    },
  };
}
