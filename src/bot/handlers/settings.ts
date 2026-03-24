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

export async function handleSettingsDeclaration(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_declaration_day';
  ctx.session.settingsData = { editing: 'declaration' };
  await ctx.reply('День напоминания о declaration недели:', { reply_markup: getDayPickerRows('settings_declaration_day') });
}

export async function handleSettingsDeclarationDay(ctx: AppContext, day: number, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.settingsData = { ...ctx.session.settingsData, declaration_day: day };
  ctx.session.step = 'settings_declaration_time';
  await ctx.reply('Время:', { reply_markup: getTimePickerRows('settings_declaration_time') });
}

export async function handleSettingsDeclarationTimeCustom(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_declaration_time_input';
  logger.debug({ userId: ctx.userId }, 'Settings declaration: custom time input');
  await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
}

export async function handleSettingsDeclarationTime(ctx: AppContext, time: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const day = ctx.session?.settingsData?.declaration_day ?? 0;
  await ctx.answerCallbackQuery();
  await settingsService.updateDeclarationNotify(userId, day, time);
  logger.info({ userId, day, time }, 'Settings declaration notify updated');
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.settingsData = undefined;
  await deps.showSettingsMenu(ctx, userId);
}

export async function handleSettingsFixation(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_fixation_days';
  ctx.session.settingsData = { editing: 'fixation' };
  await ctx.reply('Дни фиксации:', {
    reply_markup: [[
      { text: '5 дн. (пн–пт)', callback_data: 'settings_fixation_days_12345' },
      { text: '6 дн. (пн–сб)', callback_data: 'settings_fixation_days_123456' },
      { text: 'Ежедневно', callback_data: 'settings_fixation_days_0123456' },
    ]],
  });
}

export async function handleSettingsFixationDays(ctx: AppContext, raw: string, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  const days = raw.split('').map((c) => parseInt(c, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6).join(',');
  ctx.session.settingsData = { ...ctx.session.settingsData, fixation_days: days };
  ctx.session.step = 'settings_fixation_time';
  await ctx.reply('Время:', { reply_markup: getTimePickerRows('settings_fixation_time') });
}

export async function handleSettingsFixationTimeCustom(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_fixation_time_input';
  logger.debug({ userId: ctx.userId }, 'Settings fixation: custom time input');
  await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
}

export async function handleSettingsFixationTime(ctx: AppContext, time: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const raw = ctx.session?.settingsData?.fixation_days ?? '12345';
  const days = raw.split('').map((c) => parseInt(c, 10)).filter((n) => !isNaN(n) && n >= 0 && n <= 6).join(',');
  await ctx.answerCallbackQuery();
  await settingsService.updateFixationNotify(userId, days, time);
  logger.info({ userId, days, time }, 'Settings fixation notify updated');
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.settingsData = undefined;
  await deps.showSettingsMenu(ctx, userId);
}

export async function handleSettingsReport(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_report_day';
  ctx.session.settingsData = { editing: 'report' };
  await ctx.reply('День напоминания о report недели:', { reply_markup: getDayPickerRows('settings_report_day') });
}

export async function handleSettingsReportDay(ctx: AppContext, day: number, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.settingsData = { ...ctx.session.settingsData, report_day: day };
  ctx.session.step = 'settings_report_time';
  await ctx.reply('Время:', { reply_markup: getTimePickerRows('settings_report_time') });
}

export async function handleSettingsReportTimeCustom(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'settings_report_time_input';
  logger.debug({ userId: ctx.userId }, 'Settings report: custom time input');
  await ctx.reply(SETTINGS_TIME_INPUT_QUESTION);
}

export async function handleSettingsReportTime(ctx: AppContext, time: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const day = ctx.session?.settingsData?.report_day ?? 5;
  await ctx.answerCallbackQuery();
  await settingsService.updateReportNotify(userId, day, time);
  logger.info({ userId, day, time }, 'Settings report notify updated');
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
      if (step === 'settings_declaration_time_input' && typeof data?.declaration_day === 'number') {
        await settingsService.updateDeclarationNotify(userId, data.declaration_day, time);
        logger.info({ userId, day: data.declaration_day, time }, 'Settings declaration notify updated (custom)');
        saved = true;
      } else if (step === 'settings_fixation_time_input' && data?.fixation_days) {
        const days = String(data.fixation_days);
        await settingsService.updateFixationNotify(userId, days, time);
        logger.info({ userId, days, time }, 'Settings fixation notify updated (custom)');
        saved = true;
      } else if (step === 'settings_report_time_input' && typeof data?.report_day === 'number') {
        await settingsService.updateReportNotify(userId, data.report_day, time);
        logger.info({ userId, day: data.report_day, time }, 'Settings report notify updated (custom)');
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
  bot.callbackQuery(/^settings_declaration$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsDeclaration(appCtx, deps);
  });
  bot.callbackQuery(/^settings_declaration_day_(\d)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsDeclarationDay(appCtx, parseInt(ctx.match[1], 10), deps);
  });
  bot.callbackQuery(/^settings_declaration_time_custom$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsDeclarationTimeCustom(appCtx, deps);
  });
  bot.callbackQuery(/^settings_declaration_time_([\d-]+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsDeclarationTime(appCtx, timeFromCallback(ctx.match), deps);
  });
  bot.callbackQuery(/^settings_fixation$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsFixation(appCtx, deps);
  });
  bot.callbackQuery(/^settings_fixation_days_(.+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsFixationDays(appCtx, ctx.match[1], deps);
  });
  bot.callbackQuery(/^settings_fixation_time_custom$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsFixationTimeCustom(appCtx, deps);
  });
  bot.callbackQuery(/^settings_fixation_time_([\d-]+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsFixationTime(appCtx, timeFromCallback(ctx.match), deps);
  });
  bot.callbackQuery(/^settings_report$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReport(appCtx, deps);
  });
  bot.callbackQuery(/^settings_report_day_(\d)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReportDay(appCtx, parseInt(ctx.match[1], 10), deps);
  });
  bot.callbackQuery(/^settings_report_time_custom$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReportTimeCustom(appCtx, deps);
  });
  bot.callbackQuery(/^settings_report_time_([\d-]+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsReportTime(appCtx, timeFromCallback(ctx.match), deps);
  });
  bot.callbackQuery(/^settings_tz$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleSettingsTz(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) => {
      const step = ctx.session?.step;
      return (
        (step === 'settings_declaration_time_input' ||
          step === 'settings_fixation_time_input' ||
          step === 'settings_report_time_input') &&
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
