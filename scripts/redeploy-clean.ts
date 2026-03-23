import 'dotenv/config';
import { Pool } from 'pg';
import { execSync } from 'node:child_process';

async function clearFixationData(dbUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM fixations");
    await client.query("DELETE FROM events WHERE event_type = 'FixationSubmitted' AND idempotency_key ~ '^fixation:'");
    await client.query("DELETE FROM idempotency_cache WHERE idempotency_key ~ '^fixation:'");
    await client.query("DELETE FROM llm_calls WHERE event_type = 'fixation'");
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
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

  console.log('1/3 Clear fixation data...');
  await clearFixationData(dbUrl);
  console.log('Fixation cleanup completed.');

  console.log('2/3 Build project...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('3/3 Restart founder-mode service...');
  restartService();

  console.log('Done: fixation cleanup, build, and service restart completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
