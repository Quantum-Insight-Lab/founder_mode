/**
 * Notification scheduler: sends "Время X" + [Продолжить] at configured day+time per user
 */
import cron from 'node-cron';
import type { Api } from 'grammy';
import type { Pool } from 'pg';
import { InlineKeyboard } from 'grammy';
import { logger } from './logger.js';
import { parseTimezoneOffset } from '../domain/timezone.js';
import { getWeekId } from '../services/plan-service.js';

const NOTIFY_WINDOW_MIN = 7;

function dateStrToWeekId(dateStr: string): string {
  return getWeekId(new Date(dateStr + 'T12:00:00Z'));
}

export function initNotificationScheduler(pool: Pool, botApi: Api) {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const rows = await pool.query<{
        user_id: string;
        tg_id: string;
        timezone: string | null;
        plan_notify_day: number | null;
        plan_notify_time: string | null;
        reflect_notify_days: string | null;
        reflect_notify_time: string | null;
        review_notify_day: number | null;
        review_notify_time: string | null;
        last_plan_notify_week_id: string | null;
        last_reflect_notify_date: string | null;
        last_review_notify_week_id: string | null;
      }>(
        `SELECT s.user_id, u.tg_id, s.timezone,
                s.plan_notify_day, s.plan_notify_time,
                s.reflect_notify_days, s.reflect_notify_time,
                s.review_notify_day, s.review_notify_time,
                s.last_plan_notify_week_id, s.last_reflect_notify_date, s.last_review_notify_week_id
         FROM user_settings s
         JOIN users u ON u.user_id = s.user_id
         WHERE s.notifications_enabled = true
           AND (s.plan_notify_day IS NOT NULL OR s.reflect_notify_days IS NOT NULL OR s.review_notify_day IS NOT NULL)`
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

        const checkReflect = () => {
          if (!r.reflect_notify_days || !r.reflect_notify_time) return false;
          const days = r.reflect_notify_days.split(',').map((x) => parseInt(x.trim(), 10));
          if (!days.includes(userDay)) return false;
          const [th, tm] = r.reflect_notify_time.split(':').map((x) => parseInt(x, 10));
          const targetMins = th * 60 + tm;
          return (
            userMins >= targetMins - NOTIFY_WINDOW_MIN &&
            userMins <= targetMins + NOTIFY_WINDOW_MIN
          );
        };

        if (check(r.plan_notify_day, r.plan_notify_time, 'plan') && r.last_plan_notify_week_id !== userWeekId) {
          await botApi
            .sendMessage(r.tg_id, '⏰ Время планирования', {
              reply_markup: new InlineKeyboard().text('Продолжить', 'notify_plan'),
            })
            .then(async () => {
              await pool.query(
                'UPDATE user_settings SET last_plan_notify_week_id = $1, updated_at = NOW() WHERE user_id = $2',
                [userWeekId, r.user_id]
              );
              logger.debug({ userId: r.user_id, weekId: userWeekId }, 'Notify plan sent');
            })
            .catch((e) => logger.warn({ err: e, userId: r.user_id }, 'Notify plan send failed'));
        }
        if (checkReflect() && r.last_reflect_notify_date !== userDateStr) {
          await botApi
            .sendMessage(r.tg_id, '⏰ Время рефлексии', {
              reply_markup: new InlineKeyboard().text('Продолжить', 'notify_reflect'),
            })
            .then(async () => {
              await pool.query(
                'UPDATE user_settings SET last_reflect_notify_date = $1::date, updated_at = NOW() WHERE user_id = $2',
                [userDateStr, r.user_id]
              );
              logger.debug({ userId: r.user_id, date: userDateStr }, 'Notify reflect sent');
            })
            .catch((e) => logger.warn({ err: e, userId: r.user_id }, 'Notify reflect send failed'));
        }
        if (check(r.review_notify_day, r.review_notify_time, 'review') && r.last_review_notify_week_id !== userWeekId) {
          await botApi
            .sendMessage(r.tg_id, '⏰ Время обзора', {
              reply_markup: new InlineKeyboard().text('Продолжить', 'notify_review'),
            })
            .then(async () => {
              await pool.query(
                'UPDATE user_settings SET last_review_notify_week_id = $1, updated_at = NOW() WHERE user_id = $2',
                [userWeekId, r.user_id]
              );
              logger.debug({ userId: r.user_id, weekId: userWeekId }, 'Notify review sent');
            })
            .catch((e) => logger.warn({ err: e, userId: r.user_id }, 'Notify review send failed'));
        }
      }
    } catch (err) {
      logger.error({ err }, 'Notification scheduler error');
    }
  });

  logger.info('Notification scheduler started (every 15 min)');
}
