import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

function getMigrationFiles(): string[] {
  const dir = resolve(process.cwd(), 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function migrate(dbUrl: string, label: string) {
  const pool = new Pool({ connectionString: dbUrl });
  const names = getMigrationFiles();
  for (const name of names) {
    const sql = readFileSync(resolve(process.cwd(), 'migrations', name), 'utf-8');
    await pool.query(sql);
    console.log(`Migration ${name} applied to ${label}`);
  }
  await pool.end();
}

async function main() {
  const urls: { url: string; label: string }[] = [];
  if (process.env.DATABASE_URL) urls.push({ url: process.env.DATABASE_URL, label: 'main' });
  if (process.env.TEST_DATABASE_URL) urls.push({ url: process.env.TEST_DATABASE_URL, label: 'test' });

  if (urls.length === 0) {
    throw new Error('Set DATABASE_URL or TEST_DATABASE_URL');
  }

  for (const { url, label } of urls) {
    await migrate(url, label);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
