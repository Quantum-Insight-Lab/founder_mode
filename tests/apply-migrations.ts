import type { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

/** Apply all `migrations/*.sql` in lexical order (same as production migrate). */
export async function applyAllMigrations(pool: Pool): Promise<void> {
  if (process.env.VITEST === 'true') {
    await pool.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO PUBLIC;
    `);
  }
  const migrationDir = resolve(process.cwd(), 'migrations');
  const files = readdirSync(migrationDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(resolve(migrationDir, file), 'utf-8');
    await pool.query(sql);
  }
}
