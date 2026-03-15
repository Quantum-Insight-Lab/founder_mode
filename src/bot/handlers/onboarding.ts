import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  ONBOARDING_INTRO,
  ONBOARDING_TIMEZONE_QUESTION,
  ONBOARDING_TIMEZONE_INVALID,
  ONBOARDING_CTA_QUESTION,
  PLANNING_QUESTIONS,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { botOpens, funnelStarted } from '../../observability/metrics.js';
import { userTimeToTimezone } from '../../domain/timezone.js';
import type { HandlerDeps } from './deps.js';

export async function handleStart(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, ensureUser, countRows } = deps;
  botOpens.inc();
  const userId = ctx.userId;
  const hasPlans = (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_plans WHERE user_id = $1', [userId])) > 0;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId, hasPlans }, 'Command /start');

  if (hasPlans) {
    await ctx.reply(ONBOARDING_INTRO, { parse_mode: 'HTML' });
    return;
  }

  ensureSession(ctx);
  ctx.session.step = 'onboard_continue';
  await ctx.reply(ONBOARDING_INTRO, {
    parse_mode: 'HTML',
    reply_markup: [[{ text: 'Продолжить', callback_data: 'onboard_continue' }]],
  });
}

export async function handleOnboardContinue(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.debug({ userId: ctx.userId }, 'Onboarding: continue');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'onboard_timezone';
  await ctx.reply(ONBOARDING_TIMEZONE_QUESTION);
}

export async function handleOnboardTimezone(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const match = text.match(/(\d{1,2}):(\d{2})/);
  ensureSession(ctx);
  ctx.session.step = 'onboard_cta';

  let saved = false;
  if (match) {
    const tz = userTimeToTimezone(parseInt(match[1], 10), parseInt(match[2], 10));
    if (tz) {
      await settingsService.updateTimezone(userId, tz);
      saved = true;
    }
  }

  if (!saved) {
    logger.debug({ userId, text }, 'Onboarding timezone invalid');
    await ctx.reply(ONBOARDING_TIMEZONE_INVALID);
  } else {
    logger.info({ userId }, 'Onboarding timezone saved');
  }

  await ctx.reply(ONBOARDING_CTA_QUESTION, {
    reply_markup: [[
      { text: 'Да', callback_data: 'onboard_cta_yes' },
      { text: 'Позже', callback_data: 'onboard_cta_later' },
    ]],
  });
}

export async function handleOnboardCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, markOnboarded, countRows } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: CTA yes, starting plan');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'planning_0';
  ctx.session.planningAnswers = {};
  ctx.session.planEditMode = false;
  ctx.session.isFirstPlanning = (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_plans WHERE user_id = $1', [userId])) === 0;
  await markOnboarded(userId);
  funnelStarted.inc({ type: 'plan' });
  await ctx.reply(PLANNING_QUESTIONS[0].text);
}

export async function handleOnboardCtaLater(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { markOnboarded } = deps;
  logger.info({ userId: ctx.userId }, 'Onboarding: CTA later');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await markOnboarded(ctx.userId);
  await ctx.reply('Ок. Когда будешь готов — /plan');
}

export function registerOnboardingHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('start', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleStart(appCtx, deps);
  });
  bot.callbackQuery('onboard_continue', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleOnboardContinue(appCtx, deps);
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
}
