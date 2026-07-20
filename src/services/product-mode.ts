import type { Pool } from 'pg';

export type ProductMode = 'learning' | 'jobhunt' | 'work' | 'quit' | 'startup' | 'closure';
export type EngineMode = ProductMode;

export const ENGINE_MODES: EngineMode[] = ['learning', 'jobhunt', 'work', 'quit', 'startup', 'closure'];

export function isEngineMode(mode: ProductMode | null | undefined): mode is EngineMode {
  return (
    mode === 'learning' ||
    mode === 'jobhunt' ||
    mode === 'work' ||
    mode === 'quit' ||
    mode === 'startup' ||
    mode === 'closure'
  );
}

export function productModeLabel(mode: ProductMode | null | undefined): string {
  if (mode === 'closure') return 'Closure';
  if (mode === 'learning') return 'Learning';
  if (mode === 'jobhunt') return 'Job hunt';
  if (mode === 'work') return 'Work';
  if (mode === 'quit') return 'Quit';
  if (mode === 'startup') return 'Startup';
  return '—';
}

export async function getUserProductMode(pool: Pool, userId: string): Promise<ProductMode | null> {
  const row = await pool.query<{ product_mode: ProductMode | null }>(
    'SELECT product_mode FROM user_settings WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return row.rows[0]?.product_mode ?? null;
}

export async function setUserProductMode(pool: Pool, userId: string, mode: ProductMode): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id, product_mode, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET product_mode = $2, updated_at = NOW()`,
    [userId, mode]
  );
}
