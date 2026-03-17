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
  ONBOARDING_AFTER_TZ_PROMPT_PLAN,
  ONBOARDING_CTA_LATER_FIRST_MSG,
  ONBOARDING_CTA_YES_FINAL_MSG,
  ONBOARDING_CTA_LATER_MSG,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { botOpens } from '../../observability/metrics.js';
import { userTimeToTimezone } from '../../domain/timezone.js';
import type { HandlerDeps } from './deps.js';

export async function handleStart(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  botOpens.inc();
  const userId = ctx.userId;
  const r = await pool.query<{ onboarding_completed_at: Date | null }>(
    'SELECT onboarding_completed_at FROM users WHERE user_id = $1',
    [userId]
  );
  const onboardingCompleted = r.rows[0]?.onboarding_completed_at != null;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId, onboardingCompleted }, 'Command /start');

  if (onboardingCompleted) {
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

  let saved = false;
  let tz: string | null = null;
  if (match) {
    tz = userTimeToTimezone(parseInt(match[1], 10), parseInt(match[2], 10));
    if (tz) {
      await settingsService.updateTimezone(userId, tz);
      saved = true;
    }
  }

  if (!saved) {
    ctx.session.step = 'onboard_timezone';
    logger.debug({ userId, text }, 'Onboarding timezone invalid');
    await ctx.reply(ONBOARDING_TIMEZONE_INVALID);
  } else {
    logger.info({ userId }, 'Onboarding timezone saved');
    await ctx.reply(`Таймзона установлена: <b>${tz}</b>`, { parse_mode: 'HTML' });
    await ctx.reply(ONBOARDING_AFTER_TZ_PROMPT_PLAN);
  }
}

export async function handleOnboardCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { markOnboarded } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: CTA yes');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'onboard_timezone';
  await markOnboarded(userId);
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

export async function handleOnboardReviewCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: review CTA yes');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  await ctx.reply(ONBOARDING_CTA_YES_FINAL_MSG);
}

export async function handleOnboardReviewCtaLater(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: review CTA later');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
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
  bot.callbackQuery('onboard_review_cta_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardReviewCtaYes(appCtx, deps);
  });
  bot.callbackQuery('onboard_review_cta_later', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardReviewCtaLater(appCtx, deps);
  });
}
