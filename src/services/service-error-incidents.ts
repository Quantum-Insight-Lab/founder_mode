import type { Pool } from 'pg';
import { InvariantViolationError } from '../domain/errors.js';
import { logger } from '../observability/logger.js';
import type { Channel } from '../bot/transport/types.js';

export async function recordServiceErrorIncident(
  pool: Pool,
  params: { userId: string; channel: Channel; context: string; err: unknown }
): Promise<void> {
  if (params.err instanceof InvariantViolationError) return;
  const msg = params.err instanceof Error ? params.err.message : String(params.err);
  const truncated = msg.slice(0, 8000);
  try {
    await pool.query(
      `INSERT INTO service_error_incidents (user_id, channel, context, error_message)
       VALUES ($1, $2, $3, $4)`,
      [params.userId, params.channel, params.context, truncated]
    );
  } catch (e) {
    logger.warn({ err: e, userId: params.userId }, 'recordServiceErrorIncident failed');
  }
}

export interface OpenIncidentRow {
  id: string;
  user_id: string;
  channel: Channel;
}

/** Все открытые инциденты (для скрипта уведомлений). */
export async function listOpenIncidents(pool: Pool): Promise<OpenIncidentRow[]> {
  const r = await pool.query<OpenIncidentRow>(
    `SELECT id, user_id, channel FROM service_error_incidents WHERE status = 'open' ORDER BY created_at ASC`
  );
  return r.rows;
}

export async function markIncidentsResolved(
  pool: Pool,
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const r = await pool.query(
    `UPDATE service_error_incidents
     SET status = 'resolved', resolved_at = NOW(), notified_at = NOW()
     WHERE id = ANY($1::uuid[]) AND status = 'open'`,
    [ids]
  );
  return r.rowCount ?? 0;
}
