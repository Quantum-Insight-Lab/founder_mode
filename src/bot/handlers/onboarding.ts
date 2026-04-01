import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  ONBOARDING_INTRO,
  ONBOARDING_MSG_1,
  ONBOARDING_MSG_2,
  ONBOARDING_MSG_3,
  ONBOARDING_CTA_QUESTION,
  ONBOARDING_AFTER_CTA_YES,
  ONBOARDING_TIMEZONE_QUESTION,
  ONBOARDING_TIMEZONE_INVALID,
  ONBOARDING_TIMEZONE_DEFAULT,
  ONBOARDING_AFTER_TZ_PROMPT_PLAN,
  ONBOARDING_CTA_LATER_FIRST_MSG,
  ONBOARDING_CTA_YES_FINAL_MSG,
  ONBOARDING_CTA_LATER_MSG,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { botOpens, experimentCompleted, experimentStarted } from '../../observability/metrics.js';
import { userTimeToTimezone } from '../../domain/timezone.js';
import type { HandlerDeps } from './deps.js';

export async function handleStart(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  botOpens.inc();
  const userId = ctx.userId;
  const r = await pool.query<{ onboarding_completed_at: Date | null; onboarding_started_at: Date | null }>(
    'SELECT onboarding_completed_at, onboarding_started_at FROM users WHERE user_id = $1',
    [userId]
  );
  const onboardingCompleted = r.rows[0]?.onboarding_completed_at != null;
  const onboardingStarted = r.rows[0]?.onboarding_started_at != null;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId, onboardingCompleted }, 'Command /start');

  // Once the user explicitly opted into the experiment (CTA "Да"), /start should show the concise intro.
  // Completion is tracked separately (e.g. after first report CTA).
  if (onboardingStarted || onboardingCompleted) {
    await ctx.reply(ONBOARDING_INTRO, { parse_mode: 'HTML' });
    return;
  }

  ensureSession(ctx);
  ctx.session.step = 'onboard_cta';
  await ctx.reply(ONBOARDING_MSG_1);
  await ctx.reply(ONBOARDING_MSG_2);
  await ctx.reply(ONBOARDING_MSG_3);
  await ctx.reply(ONBOARDING_CTA_QUESTION, {
    reply_markup: [[
      { text: 'Да', callback_data: 'onboard_cta_yes' },
      { text: 'Позже', callback_data: 'onboard_cta_later' },
    ]],
  });
}

export async function handleOnboardTimezone(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const match = text.match(/(\d{1,2}):(\d{2})/);
  ensureSession(ctx);
  ctx.session.step = undefined;

  let tz: string | null = null;
  if (match) {
    tz = userTimeToTimezone(parseInt(match[1], 10), parseInt(match[2], 10));
  }

  if (!tz) {
    logger.info({ userId, text }, 'Onboarding timezone invalid, using default UTC+0');
    await settingsService.updateTimezone(userId, ONBOARDING_TIMEZONE_DEFAULT);
    await ctx.reply(ONBOARDING_TIMEZONE_INVALID, { parse_mode: 'HTML' });
    await ctx.reply(`Часовой пояс установлен: <b>${ONBOARDING_TIMEZONE_DEFAULT}</b>`, { parse_mode: 'HTML' });
    await ctx.reply(ONBOARDING_AFTER_TZ_PROMPT_PLAN);
    return;
  }

  await settingsService.updateTimezone(userId, tz);
  logger.info({ userId }, 'Onboarding timezone saved');
  await ctx.reply(`Часовой пояс установлен: <b>${tz}</b>`, { parse_mode: 'HTML' });
  await ctx.reply(ONBOARDING_AFTER_TZ_PROMPT_PLAN);
}

export async function handleOnboardCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: CTA yes');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'onboard_timezone';
  await pool.query('UPDATE users SET onboarding_started_at = NOW() WHERE user_id = $1', [userId]);
  experimentStarted.inc();
  await ctx.reply(ONBOARDING_AFTER_CTA_YES);
  await ctx.reply(ONBOARDING_TIMEZONE_QUESTION);
}

export async function handleOnboardCtaLater(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.info({ userId: ctx.userId }, 'Onboarding: CTA later');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await ctx.reply(ONBOARDING_CTA_LATER_FIRST_MSG);
}

export async function handleOnboardReportCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: report CTA yes');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  experimentCompleted.inc();
  await ctx.reply(ONBOARDING_CTA_YES_FINAL_MSG);
}

export async function handleOnboardReportCtaLater(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: report CTA later');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  experimentCompleted.inc();
  await ctx.reply(ONBOARDING_CTA_LATER_MSG);
}

export function registerOnboardingHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('start', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleStart(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'onboard_timezone' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleOnboardTimezone(appCtx, ctx.message.text?.trim() ?? '', deps);
    }
  );
  bot.callbackQuery('onboard_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardCtaYes(appCtx, deps);
  });
  bot.callbackQuery('onboard_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardCtaLater(appCtx, deps);
  });
  bot.callbackQuery('onboard_report_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardReportCtaYes(appCtx, deps);
  });
  bot.callbackQuery('onboard_report_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardReportCtaLater(appCtx, deps);
  });
}
