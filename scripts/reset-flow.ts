import 'dotenv/config';
import { Pool } from 'pg';

interface Args {
  userId?: string;
  all: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  let userId: string | undefined;
  let all = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--user-id') {
      userId = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--all') {
      all = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
  }

  if (!all && !userId) {
    throw new Error('Pass --user-id <uuid> or use --all');
  }
  if (all && userId) {
    throw new Error('Use either --all or --user-id, not both');
  }

  return { userId: userId?.trim() || undefined, all, dryRun };
}

async function main() {
  const { userId, all, dryRun } = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (all) {
      const counts = await client.query<{
        declarations: string;
        result_reports: string;
        plans: string;
        reflections: string;
        reviews: string;
        events: string;
        cache: string;
      }>(
        `SELECT
          (SELECT COUNT(*)::bigint FROM weekly_declarations) AS declarations,
          (SELECT COUNT(*)::bigint FROM weekly_result_reports) AS result_reports,
          (SELECT COUNT(*)::bigint FROM weekly_plans) AS plans,
          (SELECT COUNT(*)::bigint FROM daily_reflections) AS reflections,
          (SELECT COUNT(*)::bigint FROM weekly_reviews) AS reviews,
          (SELECT COUNT(*)::bigint FROM events) AS events,
          (SELECT COUNT(*)::bigint FROM idempotency_cache WHERE idempotency_key ~ '^(declaration|result_report|plan|reflection|review):') AS cache`
      );

      if (!dryRun) {
        await client.query('DELETE FROM weekly_result_reports');
        await client.query('DELETE FROM weekly_declarations');
        await client.query('DELETE FROM weekly_reviews');
        await client.query('DELETE FROM daily_reflections');
        await client.query('DELETE FROM weekly_plans');
        await client.query(
          "DELETE FROM events WHERE event_type IN ('DeclarationCreated','DeclarationUpdated','ResultReportCreated','ResultReportUpdated','PlanCreated','PlanUpdated','ReflectionSubmitted','ReviewGenerated')"
        );
        await client.query(
          "DELETE FROM idempotency_cache WHERE idempotency_key ~ '^(declaration|result_report|plan|reflection|review):'"
        );
      }

      await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
      console.log(dryRun ? 'Dry run (all users):' : 'Flow reset completed (all users).');
      console.log(JSON.stringify(counts.rows[0], null, 2));
      return;
    }

    const counts = await client.query<{
      declarations: string;
      result_reports: string;
      plans: string;
      reflections: string;
      reviews: string;
      events: string;
      cache: string;
    }>(
      `SELECT
        (SELECT COUNT(*)::bigint FROM weekly_declarations WHERE user_id = $1::uuid) AS declarations,
        (SELECT COUNT(*)::bigint FROM weekly_result_reports WHERE user_id = $1::uuid) AS result_reports,
        (SELECT COUNT(*)::bigint FROM weekly_plans WHERE user_id = $1::uuid) AS plans,
        (SELECT COUNT(*)::bigint FROM daily_reflections WHERE user_id = $1::uuid) AS reflections,
        (SELECT COUNT(*)::bigint FROM weekly_reviews WHERE user_id = $1::uuid) AS reviews,
        (SELECT COUNT(*)::bigint FROM events WHERE actor_id = $2 OR payload->>'user_id' = $2) AS events,
        (SELECT COUNT(*)::bigint FROM idempotency_cache WHERE idempotency_key LIKE $3 OR idempotency_key LIKE $4 OR idempotency_key LIKE $5 OR idempotency_key LIKE $6 OR idempotency_key LIKE $7) AS cache`,
      [
        userId,
        userId,
        `declaration:${userId}:%`,
        `result_report:${userId}:%`,
        `plan:${userId}:%`,
        `reflection:${userId}:%`,
        `review:${userId}:%`,
      ]
    );

    if (!dryRun) {
      await client.query('DELETE FROM weekly_result_reports WHERE user_id = $1::uuid', [userId]);
      await client.query('DELETE FROM weekly_declarations WHERE user_id = $1::uuid', [userId]);
      await client.query('DELETE FROM weekly_reviews WHERE user_id = $1::uuid', [userId]);
      await client.query('DELETE FROM daily_reflections WHERE user_id = $1::uuid', [userId]);
      await client.query('DELETE FROM weekly_plans WHERE user_id = $1::uuid', [userId]);
      await client.query('DELETE FROM events WHERE actor_id = $1 OR payload->>\'user_id\' = $1', [userId]);
      await client.query(
        `DELETE FROM idempotency_cache
         WHERE idempotency_key LIKE $1 OR idempotency_key LIKE $2 OR idempotency_key LIKE $3 OR idempotency_key LIKE $4 OR idempotency_key LIKE $5`,
        [
          `declaration:${userId}:%`,
          `result_report:${userId}:%`,
          `plan:${userId}:%`,
          `reflection:${userId}:%`,
          `review:${userId}:%`,
        ]
      );
    }

    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    console.log(dryRun ? `Dry run for user ${userId}:` : `Flow reset completed for user ${userId}.`);
    console.log(JSON.stringify(counts.rows[0], null, 2));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
