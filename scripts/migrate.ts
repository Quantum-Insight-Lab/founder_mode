import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function migrate(dbUrl: string, label: string) {
  const pool = new Pool({ connectionString: dbUrl });
  const sql = readFileSync(resolve(process.cwd(), 'migrations/001_init.sql'), 'utf-8');
  await pool.query(sql);
  await pool.end();
  console.log(`Migration 001 applied to ${label}`);
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
