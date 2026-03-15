import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import {
  ONBOARDING_TIMEZONE_QUESTION,
  ONBOARDING_TIMEZONE_INVALID,
  SETTINGS_TIME_INPUT_QUESTION,
  SETTINGS_TIME_INVALID,
} from '../conversations.js';
import { formatDay, formatDays, formatTime } from '../../services/settings-service.js';
import { userTimeToTimezone } from '../../domain/timezone.js';
import { logger } from '../../observability/logger.js';
import { NOTIFICATION_TIMES } from '../conversations.js';
import type { HandlerDeps } from './deps.js';

function addTimePicker(kb: InlineKeyboard, prefix: string): void {
  for (const t of NOTIFICATION_TIMES) kb.text(t, `${prefix}_${t.replace(':', '-')}`);
  kb.text('Своё время', `${prefix}_custom`);
}
function addDayPicker(kb: InlineKeyboard, prefix: string): void {
  for (let d = 0; d <= 6; d++) kb.text(formatDay(d), `${prefix}_${d}`);
}
function timeFromCallback(match: string | RegExpMatchArray): string {
  const s = Array.isArray(match) ? match[1] : match;
  return String(s ?? '').replace('-', ':');
}

export function registerSettingsHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  const { ensureUser, settingsService } = deps;

  bot.command('settings', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.info({ tgId }, 'Command /settings');
    ensureSession(ctx);
    ctx.session.step = undefined;
    await deps.showSettingsMenu(ctx, userId);
  });

  bot.callbackQuery('settings_notif_toggle', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    await ctx.answerCallbackQuery();
    await settingsService.toggleNotifications(userId);
    logger.info({ userId }, 'Settings notifications toggled');
    await deps.showSettingsMenu(ctx, userId);
  });

  bot.callbackQuery(/^settings_plan$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = 'settings_plan_day';
    ctx.session.settingsData = { editing: 'plan' };
    const kb = new InlineKeyboard();
    addDayPicker(kb, 'settings_plan_day');
    await ctx.reply('День уведомления о планировании:', { reply_markup: kb });
  });

  bot.callbackQuery(/^settings_plan_day_(\d)$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const day = parseInt(ctx.match[1], 10);
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.settingsData = { ...ctx.session.settingsData, plan_day: day };
    ctx.session.step = 'settings_plan_time';
    const kb = new InlineKeyboard();
    addTimePicker(kb, 'settings_plan_time');
    await ctx.reply('Время:', { reply_markup: kb });
  });

  bot.callbackQuery(/^settings_plan_time_custom$/, async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = 'settings_plan_time_input';
    logger.debug({ userId }, 'Settings plan: custom time input');
    await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
  });

  bot.callbackQuery(/^settings_plan_time_([\d-]+)$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const time = timeFromCallback(ctx.match);
    const day = ctx.session?.settingsData?.plan_day ?? 0;
    await ctx.answerCallbackQuery();
    await settingsService.updatePlanNotify(userId, day, time);
    logger.info({ userId, day, time }, 'Settings plan notify updated');
    ensureSession(ctx);
    ctx.session.step = undefined;
    ctx.session.settingsData = undefined;
    await deps.showSettingsMenu(ctx, userId);
  });

  bot.callbackQuery(/^settings_reflect$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    await ensureUser(tgId);
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = 'settings_reflect_days';
    ctx.session.settingsData = { editing: 'reflect' };
    const kb = new InlineKeyboard()
      .text('5 дней (пн–пт)', 'settings_reflect_days_12345')
      .text('6 дней (пн–сб)', 'settings_reflect_days_123456')
      .text('Ежедневно', 'settings_reflect_days_0123456');
    await ctx.reply('Дни рефлексии:', { reply_markup: kb });
  });

  bot.callbackQuery(/^settings_reflect_days_(.+)$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const raw = ctx.match[1];
    const days = raw.split('').map((c) => parseInt(c, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6).join(',');
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.settingsData = { ...ctx.session.settingsData, reflect_days: days };
    ctx.session.step = 'settings_reflect_time';
    const kb = new InlineKeyboard();
    addTimePicker(kb, 'settings_reflect_time');
    await ctx.reply('Время:', { reply_markup: kb });
  });

  bot.callbackQuery(/^settings_reflect_time_custom$/, async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = 'settings_reflect_time_input';
    logger.debug({ userId }, 'Settings reflect: custom time input');
    await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
  });

  bot.callbackQuery(/^settings_reflect_time_([\d-]+)$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const time = timeFromCallback(ctx.match);
    const raw = ctx.session?.settingsData?.reflect_days ?? '12345';
    const days = raw.split('').map((c) => parseInt(c, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6).join(',');
    await ctx.answerCallbackQuery();
    await settingsService.updateReflectNotify(userId, days, time);
    logger.info({ userId, days, time }, 'Settings reflect notify updated');
    ensureSession(ctx);
    ctx.session.step = undefined;
    ctx.session.settingsData = undefined;
    await deps.showSettingsMenu(ctx, userId);
  });

  bot.callbackQuery(/^settings_review$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = 'settings_review_day';
    ctx.session.settingsData = { editing: 'review' };
    const kb = new InlineKeyboard();
    addDayPicker(kb, 'settings_review_day');
    await ctx.reply('День уведомления об обзоре:', { reply_markup: kb });
  });

  bot.callbackQuery(/^settings_review_day_(\d)$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const day = parseInt(ctx.match[1], 10);
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.settingsData = { ...ctx.session.settingsData, review_day: day };
    ctx.session.step = 'settings_review_time';
    const kb = new InlineKeyboard();
    addTimePicker(kb, 'settings_review_time');
    await ctx.reply('Время:', { reply_markup: kb });
  });

  bot.callbackQuery(/^settings_review_time_custom$/, async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = 'settings_review_time_input';
    logger.debug({ userId }, 'Settings review: custom time input');
    await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
  });

  bot.callbackQuery(/^settings_review_time_([\d-]+)$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const time = timeFromCallback(ctx.match);
    const day = ctx.session?.settingsData?.review_day ?? 5;
    await ctx.answerCallbackQuery();
    await settingsService.updateReviewNotify(userId, day, time);
    logger.info({ userId, day, time }, 'Settings review notify updated');
    ensureSession(ctx);
    ctx.session.step = undefined;
    ctx.session.settingsData = undefined;
    await deps.showSettingsMenu(ctx, userId);
  });

  bot.callbackQuery(/^settings_tz$/, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    await ensureUser(tgId);
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = 'settings_tz_input';
    await ctx.reply(ONBOARDING_TIMEZONE_QUESTION);
  });

  bot.on('message:text').filter(
    (ctx) => {
      const step = ctx.session?.step;
      return (
        (step === 'settings_plan_time_input' ||
          step === 'settings_reflect_time_input' ||
          step === 'settings_review_time_input') &&
        !ctx.message.text?.trim().startsWith('/')
      );
    },
    async (ctx) => {
      const tgId = String(ctx.from?.id ?? '');
      const userId = await ensureUser(tgId);
      const text = ctx.message.text?.trim() ?? '';
      const match = text.match(/^(\d{1,2}):(\d{2})$/);
      ensureSession(ctx);
      const step = ctx.session!.step;
      const data = ctx.session!.settingsData;
      let saved = false;
      if (match) {
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          if (step === 'settings_plan_time_input' && typeof data?.plan_day === 'number') {
            await settingsService.updatePlanNotify(userId, data.plan_day, time);
            logger.info({ userId, day: data.plan_day, time }, 'Settings plan notify updated (custom)');
            saved = true;
          } else if (step === 'settings_reflect_time_input' && data?.reflect_days) {
            const days = String(data.reflect_days);
            await settingsService.updateReflectNotify(userId, days, time);
            logger.info({ userId, days, time }, 'Settings reflect notify updated (custom)');
            saved = true;
          } else if (step === 'settings_review_time_input' && typeof data?.review_day === 'number') {
            await settingsService.updateReviewNotify(userId, data.review_day, time);
            logger.info({ userId, day: data.review_day, time }, 'Settings review notify updated (custom)');
            saved = true;
          }
        }
      }
      if (!saved) {
        logger.debug({ userId, step, text }, 'Settings time input invalid');
        await ctx.reply(SETTINGS_TIME_INVALID);
        return;
      }
      ctx.session!.step = undefined;
      ctx.session!.settingsData = undefined;
      await deps.showSettingsMenu(ctx, userId);
    }
  );

  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'settings_tz_input' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const text = ctx.message.text?.trim() ?? '';
    const match = text.match(/(\d{1,2}):(\d{2})/);
    ensureSession(ctx);
    ctx.session.step = undefined;
    let saved = false;
    if (match) {
      const tz = userTimeToTimezone(parseInt(match[1], 10), parseInt(match[2], 10));
      if (tz) {
        await settingsService.updateTimezone(userId, tz);
        saved = true;
      }
    }
    if (!saved) {
      logger.debug({ userId, text }, 'Settings timezone input invalid');
      await ctx.reply(ONBOARDING_TIMEZONE_INVALID);
    } else {
      logger.info({ userId }, 'Settings timezone updated');
    }
    await deps.showSettingsMenu(ctx, userId);
  });
}
