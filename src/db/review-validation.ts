/**
 * Infrastructure: review prevalidation (DB queries for INV-003)
 */
import type { Pool } from 'pg';
import { validateReviewMinDataFromMeta } from '../domain/validators.js';

/**
 * INV-003: Review requires >= 1 plan and >= 1 reflection in day_range.
 * Fetches data from DB, then delegates to domain validator.
 */
export async function validateReviewMinData(
  pool: Pool,
  userId: string,
  weekId: string,
  dayRangeStart: string,
  dayRangeEnd: string
): Promise<void> {
  const planResult = await pool.query(
    'SELECT 1 FROM weekly_plans WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  const fixationsResult = await pool.query(
    `SELECT 1 FROM daily_fixations 
     WHERE user_id = $1 AND date >= $2 AND date <= $3`,
    [userId, dayRangeStart, dayRangeEnd]
  );
  validateReviewMinDataFromMeta({
    plan_exists: (planResult.rowCount ?? 0) >= 1,
    ref_count: fixationsResult.rowCount ?? 0,
  });
}
