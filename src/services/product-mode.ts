import type { Pool } from 'pg';

export type EngineMode = 'learning' | 'habit' | 'jobhunt';
export type LegacyProductMode = 'founder' | 'closure';
export type ProductMode = LegacyProductMode | EngineMode;

export const ENGINE_MODES: EngineMode[] = ['learning', 'habit', 'jobhunt'];

export function isEngineMode(mode: ProductMode | null | undefined): mode is EngineMode {
  return mode === 'learning' || mode === 'habit' || mode === 'jobhunt';
}

export function isClosureProductMode(mode: ProductMode | null | undefined): boolean {
  return mode === 'closure';
}

export function isFounderProductMode(mode: ProductMode | null | undefined): boolean {
  return mode === 'founder';
}

export function productModeLabel(mode: ProductMode | null | undefined): string {
  if (mode === 'closure') return 'Closure';
  if (mode === 'founder') return 'Founder Mode';
  if (mode === 'learning') return 'Learning';
  if (mode === 'habit') return 'Habit';
  if (mode === 'jobhunt') return 'Job hunt';
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
