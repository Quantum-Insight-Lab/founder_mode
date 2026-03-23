import 'dotenv/config';
import { Pool } from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

function getMigrationFiles(): string[] {
  const dir = resolve(process.cwd(), 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function resetAndMigrate(dbUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: dbUrl });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
    for (const name of getMigrationFiles()) {
      const sql = readFileSync(resolve(process.cwd(), 'migrations', name), 'utf-8');
      await pool.query(sql);
      console.log(`Migration applied: ${name}`);
    }
  } finally {
    await pool.end();
  }
}

function restartService(): void {
  const waitCommand =
    "for i in $(seq 1 60); do " +
    "state=$(systemctl is-active founder-mode 2>/dev/null || true); " +
    "if [ \"$state\" = \"active\" ]; then exit 0; fi; " +
    "sleep 1; " +
    'done; ' +
    "echo 'founder-mode did not become active in time' >&2; exit 1";

  try {
    execSync('systemctl restart founder-mode', { stdio: 'inherit' });
    execSync(waitCommand, { stdio: 'inherit', shell: '/bin/bash' });
    return;
  } catch {
    // Fallback for non-root execution environments.
  }

  try {
    execSync('sudo systemctl restart founder-mode', { stdio: 'inherit' });
    execSync(waitCommand, { stdio: 'inherit', shell: '/bin/bash' });
  } catch (err) {
    throw new Error(`Failed to restart founder-mode service: ${String(err)}`);
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required');

  console.log('1/3 Reset DB schema + run migrations...');
  await resetAndMigrate(dbUrl);
  console.log('Database reset completed.');

  console.log('2/3 Build project...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('3/3 Restart founder-mode service...');
  restartService();

  console.log('Done: DB reset, build, and service restart completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
