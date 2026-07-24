import type { Pool } from 'pg';

/** Mark focus notify as consumed for the week so scheduler won't re-send. */
export async function markFocusNotifyDone(pool: Pool, userId: string, weekId: string): Promise<void> {
  await pool.query(
    `UPDATE user_settings
        SET last_declaration_notify_week_id = $1, updated_at = NOW()
      WHERE user_id = $2`,
    [weekId, userId]
  );
}

/** Mark log/fixation notify as consumed for the local date. */
export async function markLogNotifyDone(pool: Pool, userId: string, localDateYmd: string): Promise<void> {
  await pool.query(
    `UPDATE user_settings
        SET last_fixation_notify_date = $1::date, updated_at = NOW()
      WHERE user_id = $2`,
    [localDateYmd, userId]
  );
}

/** Mark recap notify as consumed for the week. */
export async function markRecapNotifyDone(pool: Pool, userId: string, weekId: string): Promise<void> {
  await pool.query(
    `UPDATE user_settings
        SET last_report_notify_week_id = $1, updated_at = NOW()
      WHERE user_id = $2`,
    [weekId, userId]
  );
}
