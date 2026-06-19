import type { Pool } from 'pg';
import { logger } from '../observability/logger.js';
import { formatDay, formatDays, formatTime } from '../domain/date-format.js';
import type { ProductMode } from './product-mode.js';

export interface UserSettingsRow {
  user_id: string;
  timezone: string | null;
  notifications_enabled: boolean;
  product_mode: ProductMode | null;
  declaration_notify_day: number | null;
  declaration_notify_time: string | null;
  fixation_notify_days: string | null;
  fixation_notify_time: string | null;
  report_notify_day: number | null;
  report_notify_time: string | null;
  avatar_mode: 'uploaded' | 'messenger' | 'default';
  avatar_storage_key: string | null;
  avatar_mime: string | null;
  avatar_width: number | null;
  avatar_height: number | null;
  avatar_updated_at: Date | null;
  avatar_version: number;
}

export { formatDay, formatDays, formatTime };

function assertValidNotifyTime(time: string | null): void {
  if (time == null) return;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`Invalid notify time: ${time}`);
  }
}

export function createSettingsService(pool: Pool) {
  return {
    async get(userId: string): Promise<UserSettingsRow | null> {
      const row = await pool.query<UserSettingsRow>(
        `SELECT user_id, timezone,
                COALESCE(notifications_enabled, false) AS notifications_enabled,
                product_mode,
                declaration_notify_day, declaration_notify_time,
                fixation_notify_days, fixation_notify_time,
                report_notify_day, report_notify_time,
                COALESCE(avatar_mode, 'messenger') AS avatar_mode,
                avatar_storage_key, avatar_mime, avatar_width, avatar_height,
                avatar_updated_at, COALESCE(avatar_version, 0)::int AS avatar_version
         FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      return row.rows[0] ?? null;
    },

    async getOrCreate(userId: string): Promise<UserSettingsRow> {
      const existing = await this.get(userId);
      if (existing) return existing;
      await pool.query(
        `INSERT INTO user_settings (user_id, notifications_enabled)
         VALUES ($1, false) ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      return (await this.get(userId))!;
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

    async updateDeclarationNotify(userId: string, day: number | null, time: string | null): Promise<void> {
      assertValidNotifyTime(time);
      await pool.query(
        `INSERT INTO user_settings (user_id, declaration_notify_day, declaration_notify_time, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           declaration_notify_day = $2,
           declaration_notify_time = $3,
           updated_at = NOW(),
           notifications_enabled = CASE
             WHEN COALESCE(user_settings.notifications_enabled, false) = false
               AND user_settings.declaration_notify_day IS NULL
               AND user_settings.declaration_notify_time IS NULL
               AND user_settings.fixation_notify_days IS NULL
               AND user_settings.fixation_notify_time IS NULL
               AND user_settings.report_notify_day IS NULL
               AND user_settings.report_notify_time IS NULL
               AND $2 IS NOT NULL
               AND $3 IS NOT NULL
             THEN true
             ELSE user_settings.notifications_enabled
           END`,
        [userId, day, time]
      );
      logger.debug({ userId, day, time }, 'Settings: declaration notify updated');
    },

    async updateFixationNotify(userId: string, days: string | null, time: string | null): Promise<void> {
      assertValidNotifyTime(time);
      await pool.query(
        `INSERT INTO user_settings (user_id, fixation_notify_days, fixation_notify_time, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
          fixation_notify_days = $2,
          fixation_notify_time = $3,
           updated_at = NOW(),
           notifications_enabled = CASE
             WHEN COALESCE(user_settings.notifications_enabled, false) = false
               AND user_settings.declaration_notify_day IS NULL
               AND user_settings.declaration_notify_time IS NULL
               AND user_settings.fixation_notify_days IS NULL
               AND user_settings.fixation_notify_time IS NULL
               AND user_settings.report_notify_day IS NULL
               AND user_settings.report_notify_time IS NULL
               AND $2 IS NOT NULL
               AND $3 IS NOT NULL
             THEN true
             ELSE user_settings.notifications_enabled
           END`,
        [userId, days, time]
      );
      logger.debug({ userId, days, time }, 'Settings: fixation notify updated');
    },

    async updateReportNotify(userId: string, day: number | null, time: string | null): Promise<void> {
      assertValidNotifyTime(time);
      await pool.query(
        `INSERT INTO user_settings (user_id, report_notify_day, report_notify_time, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           report_notify_day = $2,
           report_notify_time = $3,
           updated_at = NOW(),
           notifications_enabled = CASE
             WHEN COALESCE(user_settings.notifications_enabled, false) = false
               AND user_settings.declaration_notify_day IS NULL
               AND user_settings.declaration_notify_time IS NULL
               AND user_settings.fixation_notify_days IS NULL
               AND user_settings.fixation_notify_time IS NULL
               AND user_settings.report_notify_day IS NULL
               AND user_settings.report_notify_time IS NULL
               AND $2 IS NOT NULL
               AND $3 IS NOT NULL
             THEN true
             ELSE user_settings.notifications_enabled
           END`,
        [userId, day, time]
      );
      logger.debug({ userId, day, time }, 'Settings: report notify updated');
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

    async setAvatarUploaded(
      userId: string,
      payload: { storageKey: string; mime: string; width: number; height: number }
    ): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (
           user_id, avatar_mode, avatar_storage_key, avatar_mime, avatar_width, avatar_height,
           avatar_updated_at, avatar_version, updated_at
         ) VALUES ($1, 'uploaded', $2, $3, $4, $5, NOW(), 1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           avatar_mode = 'uploaded',
           avatar_storage_key = $2,
           avatar_mime = $3,
           avatar_width = $4,
           avatar_height = $5,
           avatar_updated_at = NOW(),
           avatar_version = COALESCE(user_settings.avatar_version, 0) + 1,
           updated_at = NOW()`,
        [userId, payload.storageKey, payload.mime, payload.width, payload.height]
      );
      logger.debug({ userId, storageKey: payload.storageKey }, 'Settings: avatar uploaded');
    },

    async setAvatarModeMessenger(userId: string): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, avatar_mode, updated_at) VALUES ($1, 'messenger', NOW())
         ON CONFLICT (user_id) DO UPDATE SET avatar_mode = 'messenger', updated_at = NOW()`,
        [userId]
      );
      logger.debug({ userId }, 'Settings: avatar mode messenger');
    },

    async setAvatarModeDefault(userId: string): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (
           user_id, avatar_mode, avatar_storage_key, avatar_mime, avatar_width, avatar_height,
           avatar_updated_at, updated_at
         ) VALUES ($1, 'default', NULL, NULL, NULL, NULL, NULL, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           avatar_mode = 'default',
           avatar_storage_key = NULL,
           avatar_mime = NULL,
           avatar_width = NULL,
           avatar_height = NULL,
           avatar_updated_at = NULL,
           updated_at = NOW()`,
        [userId]
      );
      logger.debug({ userId }, 'Settings: avatar mode default');
    },

    async getProductMode(userId: string): Promise<ProductMode | null> {
      const row = await this.get(userId);
      return row?.product_mode ?? null;
    },

    async setProductMode(userId: string, mode: ProductMode): Promise<void> {
      await pool.query(
        `INSERT INTO user_settings (user_id, product_mode, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE SET product_mode = $2, updated_at = NOW()`,
        [userId, mode]
      );
      logger.debug({ userId, mode }, 'Settings: product mode updated');
    },

    async getAvatarPreference(userId: string): Promise<{
      mode: 'uploaded' | 'messenger' | 'default';
      storageKey: string | null;
      mime: string | null;
    }> {
      const row = await this.getOrCreate(userId);
      return {
        mode: row.avatar_mode,
        storageKey: row.avatar_storage_key,
        mime: row.avatar_mime,
      };
    },

  };
}
