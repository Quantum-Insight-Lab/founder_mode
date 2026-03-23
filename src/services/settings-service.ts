import type { Pool } from 'pg';
import { logger } from '../observability/logger.js';
import { formatDay, formatDays, formatTime } from '../domain/date-format.js';

export interface UserSettingsRow {
  user_id: string;
  /** Вторая строка в шапке карточки (имя — первая) */
  header_role: string | null;
  timezone: string | null;
  skip_review_user_note: boolean;
  notifications_enabled: boolean;
  plan_notify_day: number | null;
  plan_notify_time: string | null;
  fixation_notify_days: string | null;
  fixation_notify_time: string | null;
  review_notify_day: number | null;
  review_notify_time: string | null;
}

export { formatDay, formatDays, formatTime };

export function createSettingsService(pool: Pool) {
  return {
    async get(userId: string): Promise<UserSettingsRow | null> {
      const row = await pool.query<UserSettingsRow>(
        `SELECT user_id, header_role, timezone, COALESCE(skip_review_user_note, false) AS skip_review_user_note,
                COALESCE(notifications_enabled, false) AS notifications_enabled,
                plan_notify_day, plan_notify_time, fixation_notify_days, fixation_notify_time,
                review_notify_day, review_notify_time
         FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      return row.rows[0] ?? null;
    },

    async getOrCreate(userId: string): Promise<UserSettingsRow> {
      const existing = await this.get(userId);
      if (existing) return existing;
      await pool.query(
        `INSERT INTO user_settings (user_id, skip_review_user_note, notifications_enabled)
         VALUES ($1, false, false) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      return (await this.get(userId))!;
    },

    async updateSkipReviewUserNote(userId: string, value: boolean): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, skip_review_user_note, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET skip_review_user_note = $2, updated_at = NOW()`,
        [userId, value]
      );
    },

    async toggleNotifications(userId: string): Promise<boolean> {
      const r = await pool.query<{ notifications_enabled: boolean }>(
        `INSERT INTO user_settings (user_id, notifications_enabled, updated_at) VALUES ($1, true, NOW())
         ON CONFLICT (user_id) DO UPDATE SET notifications_enabled = NOT COALESCE(user_settings.notifications_enabled, false), updated_at = NOW()
         RETURNING notifications_enabled`,
        [userId]
      );
      const enabled = r.rows[0]!.notifications_enabled;
      logger.debug({ userId, enabled }, 'Settings: notifications toggled');
      return enabled;
    },

    async updateNotificationsEnabled(userId: string, value: boolean): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, notifications_enabled, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET notifications_enabled = $2, updated_at = NOW()`,
        [userId, value]
      );
    },

    async updatePlanNotify(userId: string, day: number | null, time: string | null): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, plan_notify_day, plan_notify_time, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           plan_notify_day = $2,
           plan_notify_time = $3,
           updated_at = NOW(),
           notifications_enabled = CASE
             WHEN notifications_enabled = false
               AND plan_notify_day IS NULL
               AND plan_notify_time IS NULL
               AND fixation_notify_days IS NULL
               AND fixation_notify_time IS NULL
               AND review_notify_day IS NULL
               AND review_notify_time IS NULL
               AND $2 IS NOT NULL
               AND $3 IS NOT NULL
             THEN true
             ELSE notifications_enabled
           END`,
        [userId, day, time]
      );
      logger.debug({ userId, day, time }, 'Settings: plan notify updated');
    },

    async updateFixationNotify(userId: string, days: string | null, time: string | null): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, fixation_notify_days, fixation_notify_time, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
          fixation_notify_days = $2,
          fixation_notify_time = $3,
           updated_at = NOW(),
           notifications_enabled = CASE
             WHEN notifications_enabled = false
               AND plan_notify_day IS NULL
               AND plan_notify_time IS NULL
              AND fixation_notify_days IS NULL
              AND fixation_notify_time IS NULL
               AND review_notify_day IS NULL
               AND review_notify_time IS NULL
               AND $2 IS NOT NULL
               AND $3 IS NOT NULL
             THEN true
             ELSE notifications_enabled
           END`,
        [userId, days, time]
      );
      logger.debug({ userId, days, time }, 'Settings: fixation notify updated');
    },

    async updateReviewNotify(userId: string, day: number | null, time: string | null): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, review_notify_day, review_notify_time, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           review_notify_day = $2,
           review_notify_time = $3,
           updated_at = NOW(),
           notifications_enabled = CASE
             WHEN notifications_enabled = false
               AND plan_notify_day IS NULL
               AND plan_notify_time IS NULL
               AND fixation_notify_days IS NULL
               AND fixation_notify_time IS NULL
               AND review_notify_day IS NULL
               AND review_notify_time IS NULL
               AND $2 IS NOT NULL
               AND $3 IS NOT NULL
             THEN true
             ELSE notifications_enabled
           END`,
        [userId, day, time]
      );
      logger.debug({ userId, day, time }, 'Settings: review notify updated');
    },

    async updateSkipHintShownAt(userId: string): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, skip_hint_shown_at, updated_at) VALUES ($1, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET skip_hint_shown_at = NOW(), updated_at = NOW()`,
        [userId]
      );
    },

    async updateTimezone(userId: string, tz: string): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, timezone, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET timezone = $2, updated_at = NOW()`,
        [userId, tz]
      );
      logger.debug({ userId, tz }, 'Settings: timezone updated');
    },

  };
}
