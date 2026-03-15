/**
 * Drop public schema and run migrations from scratch.
 * Use only for local/dev or empty DBs — destroys all data.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function resetAndMigrate(dbUrl: string, label: string) {
  const pool = new Pool({ connectionString: dbUrl });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  console.log(`Schema reset for ${label}`);

  const sql = readFileSync(resolve(process.cwd(), 'migrations', '001_init.sql'), 'utf-8');
  await pool.query(sql);
  console.log(`Migration 001_init.sql applied to ${label}`);
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
    await resetAndMigrate(url, label);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
