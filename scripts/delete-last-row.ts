import 'dotenv/config';
import { Pool } from 'pg';

type AllowedTable =
  | 'weekly_declarations'
  | 'weekly_result_reports'
  | 'weekly_plans'
  | 'daily_reflections'
  | 'weekly_reviews'
  | 'events';

const ALLOWED_TABLES: ReadonlySet<string> = new Set([
  'weekly_declarations',
  'weekly_result_reports',
  'weekly_plans',
  'daily_reflections',
  'weekly_reviews',
  'events',
]);

function parseArgs(argv: string[]): { table: AllowedTable; userId?: string; dryRun: boolean } {
  let table = '';
  let userId: string | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--table') {
      table = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--user-id') {
      userId = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
  }

  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(
      'Invalid --table. Allowed: weekly_declarations, weekly_result_reports, weekly_plans, daily_reflections, weekly_reviews, events'
    );
  }

  return { table: table as AllowedTable, userId: userId?.trim() || undefined, dryRun };
}

function buildQuery(table: AllowedTable, userId?: string, dryRun = false): { sql: string; params: string[] } {
  const hasUser = Boolean(userId) && table !== 'events';
  const params: string[] = [];
  const whereUser = hasUser ? 'WHERE user_id = $1' : '';

  if (hasUser && userId) params.push(userId);

  const action = dryRun ? 'SELECT *' : 'DELETE';

  const sql = `
    ${action} FROM ${table}
    WHERE ctid IN (
      SELECT ctid
      FROM ${table}
      ${whereUser}
      ORDER BY created_at DESC
      LIMIT 1
    )
    RETURNING *
  `;

  return { sql, params };
}

async function main() {
  const { table, userId, dryRun } = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: dbUrl });
  try {
    const { sql, params } = buildQuery(table, userId, dryRun);
    const result = await pool.query(sql, params);
    if (result.rows.length === 0) {
      console.log('No rows matched.');
      return;
    }
    console.log(dryRun ? 'Dry run row:' : 'Deleted row:');
    console.log(JSON.stringify(result.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
