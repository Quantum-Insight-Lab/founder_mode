/**
 * Notification scheduler: sends "Время X" + [Продолжить] at configured day+time per user.
 * Also sends onboarding first-Sunday report invite (no notification settings required).
 */
import cron from 'node-cron';
import type { Pool } from 'pg';
import { logger } from '../observability/logger.js';
import { parseTimezoneOffset } from '../domain/timezone.js';
import { getWeekStartEnd } from '../services/week-service.js';
import {
  computeUserLocalNotificationClock,
  isOnboardingSundayReportInviteSlot,
  matchesFixationNotificationWindow,
  matchesNotificationTimeInWindow,
} from './notification-logic.js';
import type { InlineButton } from '../bot/transport/types.js';
import { ONBOARDING_SUNDAY_REPORT_INVITE } from '../bot/conversations.js';

const NOTIFY_WINDOW_MIN = 7;

export interface NotificationSender {
  sendToTelegram(chatId: string, text: string, buttons?: InlineButton[][]): Promise<void>;
  sendToMax?(maxUserId: string, text: string, buttons?: InlineButton[][]): Promise<void>;
}

export function initNotificationScheduler(pool: Pool, sender: NotificationSender) {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const rows = await pool.query<{
        user_id: string;
        tg_id: string | null;
        max_id: string | null;
        timezone: string | null;
        declaration_notify_day: number | null;
        declaration_notify_time: string | null;
        fixation_notify_days: string | null;
        fixation_notify_time: string | null;
        report_notify_day: number | null;
        report_notify_time: string | null;
        last_declaration_notify_week_id: string | null;
        last_fixation_notify_date: string | null;
        last_report_notify_week_id: string | null;
      }>(
        `SELECT s.user_id, u.tg_id, u.max_id, s.timezone,
                s.declaration_notify_day, s.declaration_notify_time,
                s.fixation_notify_days, s.fixation_notify_time,
                s.report_notify_day, s.report_notify_time,
                s.last_declaration_notify_week_id, s.last_fixation_notify_date, s.last_report_notify_week_id
         FROM user_settings s
         JOIN users u ON u.user_id = s.user_id
         WHERE s.notifications_enabled = true
           AND (s.declaration_notify_day IS NOT NULL OR s.fixation_notify_days IS NOT NULL OR s.report_notify_day IS NOT NULL)`
      );

      const now = new Date();

      for (const r of rows.rows) {
        const offsetMin = r.timezone ? parseTimezoneOffset(r.timezone) : 0;
        if (offsetMin === null && r.timezone) continue;
        const off = offsetMin ?? 0;
        const { userDay, userMins, userDateStr, userWeekId } = computeUserLocalNotificationClock(now, off);

        const check = (targetDay: number | null, targetTime: string | null) =>
          matchesNotificationTimeInWindow(userDay, userMins, targetDay, targetTime, NOTIFY_WINDOW_MIN);

        const checkFixation = () =>
          matchesFixationNotificationWindow(
            userDay,
            userMins,
            r.fixation_notify_days,
            r.fixation_notify_time,
            NOTIFY_WINDOW_MIN
          );

        const declarationButtons: InlineButton[][] = [[{ text: 'Продолжить', callback_data: 'notify_declaration' }]];
        const reflectButtons: InlineButton[][] = [[{ text: 'Продолжить', callback_data: 'notify_fixation' }]];
        const reportButtons: InlineButton[][] = [[{ text: 'Продолжить', callback_data: 'notify_report' }]];

        const sendToUserChannels = async (
          text: string,
          buttons: InlineButton[][],
          onSuccess: () => Promise<void>
        ) => {
          let ok = false;
          if (r.tg_id) {
            try {
              await sender.sendToTelegram(r.tg_id, text, buttons);
              ok = true;
            } catch (e) {
              logger.warn({ err: e, userId: r.user_id }, 'Notify Telegram send failed');
            }
          }
          if (r.max_id && sender.sendToMax) {
            try {
              await sender.sendToMax(r.max_id, text, buttons);
              ok = true;
            } catch (e) {
              logger.warn({ err: e, userId: r.user_id }, 'Notify MAX send failed');
            }
          }
          if (ok) await onSuccess();
        };

        if (
          check(r.declaration_notify_day, r.declaration_notify_time) &&
          r.last_declaration_notify_week_id !== userWeekId
        ) {
          await sendToUserChannels('⏰ Время declaration недели', declarationButtons, async () => {
            await pool.query(
              'UPDATE user_settings SET last_declaration_notify_week_id = $1, updated_at = NOW() WHERE user_id = $2',
              [userWeekId, r.user_id]
            );
            logger.debug({ userId: r.user_id, weekId: userWeekId }, 'Notify declaration sent');
          });
        }
        if (checkFixation() && r.last_fixation_notify_date !== userDateStr) {
          await sendToUserChannels('⏰ Время фиксации', reflectButtons, async () => {
            await pool.query(
              'UPDATE user_settings SET last_fixation_notify_date = $1::date, updated_at = NOW() WHERE user_id = $2',
              [userDateStr, r.user_id]
            );
            logger.debug({ userId: r.user_id, date: userDateStr }, 'Notify fixation sent');
          });
        }
        if (check(r.report_notify_day, r.report_notify_time) && r.last_report_notify_week_id !== userWeekId) {
          await sendToUserChannels('⏰ Время report недели', reportButtons, async () => {
            await pool.query(
              'UPDATE user_settings SET last_report_notify_week_id = $1, updated_at = NOW() WHERE user_id = $2',
              [userWeekId, r.user_id]
            );
            logger.debug({ userId: r.user_id, weekId: userWeekId }, 'Notify report sent');
          });
        }
      }

      const onboardingRows = await pool.query<{
        user_id: string;
        tg_id: string | null;
        max_id: string | null;
        timezone: string | null;
        onboarding_report_invite_sent_at: Date | null;
      }>(
        `SELECT u.user_id, u.tg_id, u.max_id, s.timezone, s.onboarding_report_invite_sent_at
         FROM users u
         JOIN user_settings s ON s.user_id = u.user_id
         WHERE u.onboarding_completed_at IS NULL
           AND s.timezone IS NOT NULL
           AND s.onboarding_report_invite_sent_at IS NULL
           AND (SELECT COUNT(*)::int FROM weekly_reports w WHERE w.user_id = u.user_id) = 0`
      );
      const reportButtonsOnboard: InlineButton[][] = [
        [{ text: 'Продолжить', callback_data: 'notify_report' }],
      ];
      for (const r of onboardingRows.rows) {
        const offsetMin = r.timezone ? parseTimezoneOffset(r.timezone) : null;
        if (offsetMin === null) continue;
        const { userDay, userMins, userDateStr } = computeUserLocalNotificationClock(now, offsetMin);
        if (!isOnboardingSundayReportInviteSlot(userDay, userMins, NOTIFY_WINDOW_MIN)) continue;
        const { start: weekStart, end: weekEnd } = getWeekStartEnd(userDateStr);
        const refCount = await pool.query<{ c: number }>(
          'SELECT COUNT(*)::int AS c FROM daily_fixations WHERE user_id = $1 AND date >= $2 AND date <= $3',
          [r.user_id, weekStart, weekEnd]
        );
        if ((refCount.rows[0]?.c ?? 0) === 0) continue;
        const sendOnboard = async (text: string): Promise<boolean> => {
          let ok = false;
          if (r.tg_id) {
            try {
              await sender.sendToTelegram(r.tg_id, text, reportButtonsOnboard);
              ok = true;
            } catch (e) {
              logger.warn({ err: e, userId: r.user_id }, 'Onboarding report invite Telegram send failed');
            }
          }
          if (r.max_id && sender.sendToMax) {
            try {
              await sender.sendToMax(r.max_id, text, reportButtonsOnboard);
              ok = true;
            } catch (e) {
              logger.warn({ err: e, userId: r.user_id }, 'Onboarding report invite MAX send failed');
            }
          }
          return ok;
        };
        const ok = await sendOnboard(ONBOARDING_SUNDAY_REPORT_INVITE);
        if (ok) {
          await pool.query(
            `INSERT INTO user_settings (user_id, onboarding_report_invite_sent_at) VALUES ($1, NOW())
             ON CONFLICT (user_id) DO UPDATE SET onboarding_report_invite_sent_at = NOW(), updated_at = NOW()`,
            [r.user_id]
          );
          logger.debug({ userId: r.user_id }, 'Onboarding report invite sent');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Notification scheduler error');
    }
  });

  logger.info('Notification scheduler started (every 15 min)');
}
