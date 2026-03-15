import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
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

export function registerOnboardingHandlers(
  bot: Bot<BotContext>,
  deps: HandlerDeps
): void {
  const { pool, ensureUser, markOnboarded, countRows, settingsService } = deps;

  bot.command('start', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    botOpens.inc();
    const userId = await ensureUser(tgId);
    const hasPlans = (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_plans WHERE user_id = $1', [userId])) > 0;
    logger.info({ tgId, userId, hasPlans }, 'Command /start');

    if (hasPlans) {
      await ctx.reply(ONBOARDING_INTRO, { parse_mode: 'HTML' });
      return;
    }

    ensureSession(ctx);
    ctx.session.step = 'onboard_continue';
    await ctx.reply(ONBOARDING_INTRO, {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard().text('Продолжить', 'onboard_continue'),
    });
  });

  bot.callbackQuery('onboard_continue', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.debug({ userId }, 'Onboarding: continue');
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = 'onboard_timezone';
    await ctx.reply(ONBOARDING_TIMEZONE_QUESTION);
  });

  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'onboard_timezone' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const text = ctx.message.text?.trim() ?? '';
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
      reply_markup: new InlineKeyboard().text('Да', 'onboard_cta_yes').text('Позже', 'onboard_cta_later'),
    });
  });

  bot.callbackQuery('onboard_cta_yes', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
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
  });

  bot.callbackQuery('onboard_cta_later', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.info({ userId }, 'Onboarding: CTA later');
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.step = undefined;
    await markOnboarded(userId);
    await ctx.reply('Ок. Когда будешь готов — /plan');
  });
}
