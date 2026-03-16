import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import type { InlineButton } from '../transport/types.js';
import {
  ONBOARDING_TIMEZONE_QUESTION,
  ONBOARDING_TIMEZONE_INVALID,
  SETTINGS_TIME_INPUT_QUESTION,
  SETTINGS_TIME_INVALID,
  NOTIFICATION_TIMES,
} from '../conversations.js';
import { formatDay } from '../../services/settings-service.js';
import { userTimeToTimezone } from '../../domain/timezone.js';
import { logger } from '../../observability/logger.js';
import type { HandlerDeps } from './deps.js';

function getTimePickerRows(prefix: string): InlineButton[][] {
  const row: InlineButton[] = NOTIFICATION_TIMES.map((t) => ({
    text: t,
    callback_data: `${prefix}_${t.replace(':', '-')}`,
  }));
  row.push({ text: 'Своё время', callback_data: `${prefix}_custom` });
  return [row];
}
function getDayPickerRows(prefix: string): InlineButton[][] {
  const row: InlineButton[] = [];
  for (let d = 0; d <= 6; d++) {
    row.push({ text: formatDay(d), callback_data: `${prefix}_${d}` });
  }
  return [row];
}
function timeFromCallback(match: string | RegExpMatchArray): string {
  const s = Array.isArray(match) ? match[1] : match;
  return String(s ?? '').replace('-', ':');
}

export async function handleSettingsCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /settings');
  ensureSession(ctx);
  ctx.session.step = undefined;
  await deps.showSettingsMenu(ctx, ctx.userId);
}

export async function handleSettingsNotifToggle(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await settingsService.toggleNotifications(userId);
  logger.info({ userId }, 'Settings notifications toggled');
  await deps.showSettingsMenu(ctx, userId);
}

export async function handleSettingsPlan(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_plan_day';
  ctx.session.settingsData = { editing: 'plan' };
  await ctx.reply('День уведомления о планировании:', { reply_markup: getDayPickerRows('settings_plan_day') });
}

export async function handleSettingsPlanDay(ctx: AppContext, day: number, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.settingsData = { ...ctx.session.settingsData, plan_day: day };
  ctx.session.step = 'settings_plan_time';
  await ctx.reply('Время:', { reply_markup: getTimePickerRows('settings_plan_time') });
}

export async function handleSettingsPlanTimeCustom(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_plan_time_input';
  logger.debug({ userId: ctx.userId }, 'Settings plan: custom time input');
  await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
}

export async function handleSettingsPlanTime(ctx: AppContext, time: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const day = ctx.session?.settingsData?.plan_day ?? 0;
  await ctx.answerCallbackQuery();
  await settingsService.updatePlanNotify(userId, day, time);
  logger.info({ userId, day, time }, 'Settings plan notify updated');
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.settingsData = undefined;
  await deps.showSettingsMenu(ctx, userId);
}

export async function handleSettingsReflect(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_reflect_days';
  ctx.session.settingsData = { editing: 'reflect' };
  await ctx.reply('Дни рефлексии:', {
    reply_markup: [[
      { text: '5 дн. (пн–пт)', callback_data: 'settings_reflect_days_12345' },
      { text: '6 дн. (пн–сб)', callback_data: 'settings_reflect_days_123456' },
      { text: 'Ежедневно', callback_data: 'settings_reflect_days_0123456' },
    ]],
  });
}

export async function handleSettingsReflectDays(ctx: AppContext, raw: string, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  const days = raw.split('').map((c) => parseInt(c, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6).join(',');
  ctx.session.settingsData = { ...ctx.session.settingsData, reflect_days: days };
  ctx.session.step = 'settings_reflect_time';
  await ctx.reply('Время:', { reply_markup: getTimePickerRows('settings_reflect_time') });
}

export async function handleSettingsReflectTimeCustom(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_reflect_time_input';
  logger.debug({ userId: ctx.userId }, 'Settings reflect: custom time input');
  await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
}

export async function handleSettingsReflectTime(ctx: AppContext, time: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const raw = ctx.session?.settingsData?.reflect_days ?? '12345';
  const days = raw.split('').map((c) => parseInt(c, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6).join(',');
  await ctx.answerCallbackQuery();
  await settingsService.updateReflectNotify(userId, days, time);
  logger.info({ userId, days, time }, 'Settings reflect notify updated');
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.settingsData = undefined;
  await deps.showSettingsMenu(ctx, userId);
}

export async function handleSettingsReview(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_review_day';
  ctx.session.settingsData = { editing: 'review' };
  await ctx.reply('День уведомления об обзоре:', { reply_markup: getDayPickerRows('settings_review_day') });
}

export async function handleSettingsReviewDay(ctx: AppContext, day: number, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.settingsData = { ...ctx.session.settingsData, review_day: day };
  ctx.session.step = 'settings_review_time';
  await ctx.reply('Время:', { reply_markup: getTimePickerRows('settings_review_time') });
}

export async function handleSettingsReviewTimeCustom(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_review_time_input';
  logger.debug({ userId: ctx.userId }, 'Settings review: custom time input');
  await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
}

export async function handleSettingsReviewTime(ctx: AppContext, time: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const day = ctx.session?.settingsData?.review_day ?? 5;
  await ctx.answerCallbackQuery();
  await settingsService.updateReviewNotify(userId, day, time);
  logger.info({ userId, day, time }, 'Settings review notify updated');
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.settingsData = undefined;
  await deps.showSettingsMenu(ctx, userId);
}

export async function handleSettingsTz(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_tz_input';
  await ctx.reply(ONBOARDING_TIMEZONE_QUESTION);
}

export async function handleSettingsTimeInput(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
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

export async function handleSettingsTzInput(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
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
}

export function registerSettingsHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('settings', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsCommand(appCtx, deps);
  });
  bot.callbackQuery('settings_notif_toggle', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsNotifToggle(appCtx, deps);
  });
  bot.callbackQuery(/^settings_plan$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsPlan(appCtx, deps);
  });
  bot.callbackQuery(/^settings_plan_day_(\d)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsPlanDay(appCtx, parseInt(ctx.match[1], 10), deps);
  });
  bot.callbackQuery(/^settings_plan_time_custom$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsPlanTimeCustom(appCtx, deps);
  });
  bot.callbackQuery(/^settings_plan_time_([\d-]+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsPlanTime(appCtx, timeFromCallback(ctx.match), deps);
  });
  bot.callbackQuery(/^settings_reflect$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReflect(appCtx, deps);
  });
  bot.callbackQuery(/^settings_reflect_days_(.+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReflectDays(appCtx, ctx.match[1], deps);
  });
  bot.callbackQuery(/^settings_reflect_time_custom$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReflectTimeCustom(appCtx, deps);
  });
  bot.callbackQuery(/^settings_reflect_time_([\d-]+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReflectTime(appCtx, timeFromCallback(ctx.match), deps);
  });
  bot.callbackQuery(/^settings_review$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReview(appCtx, deps);
  });
  bot.callbackQuery(/^settings_review_day_(\d)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReviewDay(appCtx, parseInt(ctx.match[1], 10), deps);
  });
  bot.callbackQuery(/^settings_review_time_custom$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReviewTimeCustom(appCtx, deps);
  });
  bot.callbackQuery(/^settings_review_time_([\d-]+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReviewTime(appCtx, timeFromCallback(ctx.match), deps);
  });
  bot.callbackQuery(/^settings_tz$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsTz(appCtx, deps);
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
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleSettingsTimeInput(appCtx, ctx.message.text?.trim() ?? '', deps);
    }
  );
  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'settings_tz_input' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleSettingsTzInput(appCtx, ctx.message.text?.trim() ?? '', deps);
    }
  );
}
