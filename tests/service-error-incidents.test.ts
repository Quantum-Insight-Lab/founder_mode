import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { applyAllMigrations } from './apply-migrations.js';
import { InvariantViolationError } from '../src/domain/errors.js';
import {
  listOpenIncidents,
  markIncidentsResolved,
  recordServiceErrorIncident,
} from '../src/services/service-error-incidents.js';

const dbUrl = process.env.TEST_DATABASE_URL;

const userTg = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const userMax = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const tgId = 'svcerr-test-tg';
const maxId = 'svcerr-test-max';

describe.skipIf(!dbUrl)('service-error-incidents', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: dbUrl });
    await applyAllMigrations(pool);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM users WHERE user_id = ANY($1::uuid[])', [[userTg, userMax]]);
    await pool.query('INSERT INTO users (user_id, tg_id) VALUES ($1, $2)', [userTg, tgId]);
    await pool.query('INSERT INTO users (user_id, max_id) VALUES ($1, $2)', [userMax, maxId]);
  });

  it('recordServiceErrorIncident inserts open row', async () => {
    await recordServiceErrorIncident(pool, {
      userId: userTg,
      channel: 'telegram',
      context: 'test',
      err: new Error('boom'),
    });
    const rows = await listOpenIncidents(pool);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(userTg);
    expect(rows[0].channel).toBe('telegram');
  });

  it('recordServiceErrorIncident skips InvariantViolationError', async () => {
    await recordServiceErrorIncident(pool, {
      userId: userTg,
      channel: 'telegram',
      context: 'inv',
      err: new InvariantViolationError('bad', 'X'),
    });
    const rows = await listOpenIncidents(pool);
    expect(rows).toHaveLength(0);
  });

  it('recordServiceErrorIncident accepts non-Error', async () => {
    await recordServiceErrorIncident(pool, {
      userId: userTg,
      channel: 'telegram',
      context: 'plain',
      err: 'string fail',
    });
    const r = await pool.query<{ error_message: string }>(
      'SELECT error_message FROM service_error_incidents WHERE user_id = $1',
      [userTg]
    );
    expect(r.rows[0]?.error_message).toBe('string fail');
  });

  it('listOpenIncidents returns only open, ordered by created_at', async () => {
    await pool.query(
      `INSERT INTO service_error_incidents (user_id, channel, context, error_message, created_at)
       VALUES ($1, 'telegram', 'a', '1', NOW() - INTERVAL '2 seconds')`,
      [userTg]
    );
    await pool.query(
      `INSERT INTO service_error_incidents (user_id, channel, context, error_message, created_at)
       VALUES ($1, 'telegram', 'b', '2', NOW())`,
      [userTg]
    );
    const rows = await listOpenIncidents(pool);
    expect(rows).toHaveLength(2);
    const ctx = await pool.query<{ context: string }>(
      `SELECT context FROM service_error_incidents WHERE id = $1`,
      [rows[0].id]
    );
    const ctx2 = await pool.query<{ context: string }>(
      `SELECT context FROM service_error_incidents WHERE id = $1`,
      [rows[1].id]
    );
    expect(ctx.rows[0]?.context).toBe('a');
    expect(ctx2.rows[0]?.context).toBe('b');
  });

  it('markIncidentsResolved closes matching incidents', async () => {
    await recordServiceErrorIncident(pool, {
      userId: userTg,
      channel: 'telegram',
      context: 'r1',
      err: new Error('e1'),
    });
    await recordServiceErrorIncident(pool, {
      userId: userMax,
      channel: 'max',
      context: 'r2',
      err: new Error('e2'),
    });
    const open = await listOpenIncidents(pool);
    expect(open).toHaveLength(2);

    const n = await markIncidentsResolved(pool, [open[0].id]);
    expect(n).toBe(1);

    const stillOpen = await listOpenIncidents(pool);
    expect(stillOpen).toHaveLength(1);
    expect(stillOpen[0].id).toBe(open[1].id);

    const status = await pool.query<{ status: string }>(
      `SELECT status FROM service_error_incidents WHERE id = $1`,
      [open[0].id]
    );
    expect(status.rows[0]?.status).toBe('resolved');
  });

  it('markIncidentsResolved with empty ids returns 0', async () => {
    const n = await markIncidentsResolved(pool, []);
    expect(n).toBe(0);
  });
});
