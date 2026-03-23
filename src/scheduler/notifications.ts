/**
 * Notification scheduler: sends "Время X" + [Продолжить] at configured day+time per user.
 * Also sends onboarding first-Saturday review invite (no notification settings required).
 */
import cron from 'node-cron';
import type { Pool } from 'pg';
import { logger } from '../observability/logger.js';
import { parseTimezoneOffset } from '../domain/timezone.js';
import { getWeekId, getWeekStartEnd } from '../services/plan-service.js';
import type { InlineButton } from '../bot/transport/types.js';

const ONBOARDING_REVIEW_INVITE = 'Неделя подходит к концу.\n\nДавай соберём короткий обзор: что получилось, и куда двигаться дальше. Напиши (нажми) /review';

const NOTIFY_WINDOW_MIN = 7;

function dateStrToWeekId(dateStr: string): string {
  return getWeekId(new Date(dateStr + 'T12:00:00Z'));
}

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
        plan_notify_day: number | null;
        plan_notify_time: string | null;
        fixation_notify_days: string | null;
        fixation_notify_time: string | null;
        review_notify_day: number | null;
        review_notify_time: string | null;
        last_plan_notify_week_id: string | null;
        last_fixation_notify_date: string | null;
        last_review_notify_week_id: string | null;
      }>(
        `SELECT s.user_id, u.tg_id, u.max_id, s.timezone,
                s.plan_notify_day, s.plan_notify_time,
                s.fixation_notify_days, s.fixation_notify_time,
                s.review_notify_day, s.review_notify_time,
                s.last_plan_notify_week_id, s.last_fixation_notify_date, s.last_review_notify_week_id
         FROM user_settings s
         JOIN users u ON u.user_id = s.user_id
         WHERE s.notifications_enabled = true
           AND (s.plan_notify_day IS NOT NULL OR s.fixation_notify_days IS NOT NULL OR s.review_notify_day IS NOT NULL)`
      );

      const now = new Date();
      const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      const utcDay = now.getUTCDay();

      for (const r of rows.rows) {
        const offsetMin = r.timezone ? parseTimezoneOffset(r.timezone) : 0;
        if (offsetMin === null && r.timezone) continue;
        const off = offsetMin ?? 0;
        let totalMins = utcMins + off;
        let dayOffset = 0;
        if (totalMins < 0) {
          totalMins += 1440;
          dayOffset = -1;
        } else if (totalMins >= 1440) {
          totalMins -= 1440;
          dayOffset = 1;
        }
        const userDay = (utcDay + dayOffset + 7) % 7;
        const userMins = totalMins;
        const userLocalMs = now.getTime() + off * 60 * 1000;
        const userDateStr = new Date(userLocalMs).toISOString().slice(0, 10);
        const userWeekId = dateStrToWeekId(userDateStr);

        const check = (targetDay: number | null, targetTime: string | null, type: string) => {
          if (targetDay == null || !targetTime) return false;
          const [th, tm] = targetTime.split(':').map((x) => parseInt(x, 10));
          const targetMins = th * 60 + tm;
          return (
            userDay === targetDay &&
            userMins >= targetMins - NOTIFY_WINDOW_MIN &&
            userMins <= targetMins + NOTIFY_WINDOW_MIN
          );
        };

        const checkFixation = () => {
          if (!r.fixation_notify_days || !r.fixation_notify_time) return false;
          const days = r.fixation_notify_days.split(',').map((x) => parseInt(x.trim(), 10));
          if (!days.includes(userDay)) return false;
          const [th, tm] = r.fixation_notify_time.split(':').map((x) => parseInt(x, 10));
          const targetMins = th * 60 + tm;
          return (
            userMins >= targetMins - NOTIFY_WINDOW_MIN &&
            userMins <= targetMins + NOTIFY_WINDOW_MIN
          );
        };

        const planButtons: InlineButton[][] = [[{ text: 'Продолжить', callback_data: 'notify_plan' }]];
        const reflectButtons: InlineButton[][] = [[{ text: 'Продолжить', callback_data: 'notify_fixation' }]];
        const reviewButtons: InlineButton[][] = [[{ text: 'Продолжить', callback_data: 'notify_review' }]];

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

        if (check(r.plan_notify_day, r.plan_notify_time, 'plan') && r.last_plan_notify_week_id !== userWeekId) {
          await sendToUserChannels('⏰ Время планирования', planButtons, async () => {
            await pool.query(
              'UPDATE user_settings SET last_plan_notify_week_id = $1, updated_at = NOW() WHERE user_id = $2',
              [userWeekId, r.user_id]
            );
            logger.debug({ userId: r.user_id, weekId: userWeekId }, 'Notify plan sent');
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
        if (check(r.review_notify_day, r.review_notify_time, 'review') && r.last_review_notify_week_id !== userWeekId) {
          await sendToUserChannels('⏰ Время обзора', reviewButtons, async () => {
            await pool.query(
              'UPDATE user_settings SET last_review_notify_week_id = $1, updated_at = NOW() WHERE user_id = $2',
              [userWeekId, r.user_id]
            );
            logger.debug({ userId: r.user_id, weekId: userWeekId }, 'Notify review sent');
          });
        }
      }

      const onboardingRows = await pool.query<{
        user_id: string;
        tg_id: string | null;
        max_id: string | null;
        timezone: string | null;
        onboarding_review_invite_sent_at: Date | null;
      }>(
        `SELECT u.user_id, u.tg_id, u.max_id, s.timezone, s.onboarding_review_invite_sent_at
         FROM users u
         JOIN user_settings s ON s.user_id = u.user_id
         WHERE u.onboarding_completed_at IS NULL
           AND s.timezone IS NOT NULL
           AND s.onboarding_review_invite_sent_at IS NULL
           AND (SELECT COUNT(*)::int FROM weekly_reviews w WHERE w.user_id = u.user_id) = 0`
      );
      const reviewButtonsOnboard: InlineButton[][] = [[{ text: 'Продолжить', callback_data: 'notify_review' }]];
      for (const r of onboardingRows.rows) {
        const offsetMin = r.timezone ? parseTimezoneOffset(r.timezone) : null;
        if (offsetMin === null) continue;
        const off = offsetMin;
        let totalMins = utcMins + off;
        let dayOffset = 0;
        if (totalMins < 0) {
          totalMins += 1440;
          dayOffset = -1;
        } else if (totalMins >= 1440) {
          totalMins -= 1440;
          dayOffset = 1;
        }
        const userDay = (utcDay + dayOffset + 7) % 7;
        const userMins = totalMins;
        const userLocalMs = now.getTime() + off * 60 * 1000;
        const userDateStr = new Date(userLocalMs).toISOString().slice(0, 10);
        if (userDay !== 6) continue;
        const targetMins = 20 * 60 + 0;
        if (userMins < targetMins - NOTIFY_WINDOW_MIN || userMins > targetMins + NOTIFY_WINDOW_MIN) continue;
        const weekRef = new Date(userDateStr + 'T12:00:00Z');
        const { start: weekStart, end: weekEnd } = getWeekStartEnd(weekRef);
        const refCount = await pool.query<{ c: number }>(
          'SELECT COUNT(*)::int AS c FROM daily_fixations WHERE user_id = $1 AND date >= $2 AND date <= $3',
          [r.user_id, weekStart, weekEnd]
        );
        if ((refCount.rows[0]?.c ?? 0) === 0) continue;
        const sendOnboard = async (text: string): Promise<boolean> => {
          let ok = false;
          if (r.tg_id) {
            try {
              await sender.sendToTelegram(r.tg_id, text, reviewButtonsOnboard);
              ok = true;
            } catch (e) {
              logger.warn({ err: e, userId: r.user_id }, 'Onboarding review invite Telegram send failed');
            }
          }
          if (r.max_id && sender.sendToMax) {
            try {
              await sender.sendToMax(r.max_id, text, reviewButtonsOnboard);
              ok = true;
            } catch (e) {
              logger.warn({ err: e, userId: r.user_id }, 'Onboarding review invite MAX send failed');
            }
          }
          return ok;
        };
        const ok = await sendOnboard(ONBOARDING_REVIEW_INVITE);
        if (ok) {
          await pool.query(
            `INSERT INTO user_settings (user_id, onboarding_review_invite_sent_at) VALUES ($1, NOW())
             ON CONFLICT (user_id) DO UPDATE SET onboarding_review_invite_sent_at = NOW(), updated_at = NOW()`,
            [r.user_id]
          );
          logger.debug({ userId: r.user_id }, 'Onboarding review invite sent');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Notification scheduler error');
    }
  });

  logger.info('Notification scheduler started (every 15 min)');
}
