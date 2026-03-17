import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  REVIEW_USER_NOTE_QUESTION,
  ONBOARDING_AFTER_REVIEW_1,
  ONBOARDING_AFTER_REVIEW_QUESTION,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { validateReviewMinDataFromMeta } from '../../domain/validators.js';
import { dateStrToWeekRef } from '../../domain/timezone.js';
import { getProductLocalDate } from '../../db/user-timezone.js';
import { config } from '../../config/index.js';
import { getWeekId, getWeekStartEnd } from '../../services/plan-service.js';
import type { HandlerDeps } from './deps.js';

async function runReviewWithNote(
  ctx: AppContext,
  optionalUserNote: string,
  prevalidated: boolean,
  deps: HandlerDeps
): Promise<void> {
  const { pool, countRows, handleLlmReply, formatErrorForUser, reviewService } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  const wasFirstReview =
    (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_reviews WHERE user_id = $1', [userId])) === 0;
  ctx.session.step = undefined;
  await ctx.reply('🟢 Готовлю обзор...');
  try {
    const result = await reviewService.generateReview(userId, undefined, optionalUserNote, prevalidated);
    funnelCompleted.inc({ type: 'review' });
    logger.info({ userId }, 'Review generated');
    await handleLlmReply(ctx, result.content ?? '', userId, 'review');
    if (wasFirstReview) {
      await ctx.reply(ONBOARDING_AFTER_REVIEW_1);
      await ctx.reply(ONBOARDING_AFTER_REVIEW_QUESTION, {
        reply_markup: [[
          { text: 'Да', callback_data: 'onboard_review_cta_yes' },
          { text: 'Позже', callback_data: 'onboard_review_cta_later' },
        ]],
      });
      ctx.session.step = 'onboard_review_cta';
    }
  } catch (err) {
    logger.error({ err, userId }, 'Review generation failed');
    ctx.alertError?.(err, 'review', userId);
    await ctx.reply(formatErrorForUser(err));
  }
}

export async function handleReviewCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, formatErrorForUser } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /review');
  const userDateStr = await getProductLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
  const { start, end } = getWeekStartEnd(weekRef);
  const minReflections = config().product.min_reflections_for_review;
  const reviewMeta = await pool.query<{
    plan_exists: boolean;
    ref_count: number;
    review_count: number;
  }>(
    `SELECT
       (SELECT EXISTS(SELECT 1 FROM weekly_plans WHERE user_id = $1 AND week_id = $4)) AS plan_exists,
       (SELECT COUNT(*)::int FROM daily_reflections WHERE user_id = $1 AND date >= $2 AND date <= $3) AS ref_count,
       (SELECT COUNT(*)::int FROM weekly_reviews WHERE user_id = $1) AS review_count
     FROM (SELECT $1::uuid AS uid) u`,
    [userId, start, end, weekId]
  );
  const meta = reviewMeta.rows[0];
  try {
    validateReviewMinDataFromMeta(meta ?? {});
  } catch (err) {
    logger.debug({ err, userId }, 'Review precheck failed');
    ctx.alertError?.(err, 'review(precheck)', userId);
    await ctx.reply(formatErrorForUser(err));
    return;
  }
  const useSoftPrompt = (meta?.ref_count ?? 0) < minReflections;

  funnelStarted.inc({ type: 'review' });
  if (useSoftPrompt) {
    await runReviewWithNote(ctx, '', true, deps);
    return;
  }
  ensureSession(ctx);
  ctx.session.step = 'review_user_note';
  await ctx.reply(REVIEW_USER_NOTE_QUESTION);
}

export async function handleReviewUserNote(ctx: AppContext, note: string, deps: HandlerDeps): Promise<void> {
  await runReviewWithNote(ctx, note, true, deps);
}

export async function handleNotifyReview(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, formatErrorForUser } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId }, 'Notify review');
  await ctx.answerCallbackQuery();
  const userDateStr = await getProductLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
  const { start, end } = getWeekStartEnd(weekRef);
  const minReflections = config().product.min_reflections_for_review;
  const reviewMeta = await pool.query<{
    plan_exists: boolean;
    ref_count: number;
    review_count: number;
  }>(
    `SELECT
       (SELECT EXISTS(SELECT 1 FROM weekly_plans WHERE user_id = $1 AND week_id = $4)) AS plan_exists,
       (SELECT COUNT(*)::int FROM daily_reflections WHERE user_id = $1 AND date >= $2 AND date <= $3) AS ref_count,
       (SELECT COUNT(*)::int FROM weekly_reviews WHERE user_id = $1) AS review_count
     FROM (SELECT $1::uuid AS uid) u`,
    [userId, start, end, weekId]
  );
  const meta = reviewMeta.rows[0];
  try {
    validateReviewMinDataFromMeta(meta ?? {});
  } catch (err) {
    logger.debug({ err, userId }, 'Review precheck failed (notify)');
    ctx.alertError?.(err, 'review(precheck)', userId);
    await ctx.reply(formatErrorForUser(err));
    return;
  }
  const useSoftPrompt = (meta?.ref_count ?? 0) < minReflections;
  funnelStarted.inc({ type: 'review' });
  if (useSoftPrompt) {
    logger.debug({ userId, useSoftPrompt }, 'Notify review: direct run');
    await runReviewWithNote(ctx, '', true, deps);
    return;
  }
  logger.debug({ userId }, 'Notify review: showing question');
  ensureSession(ctx);
  ctx.session.step = 'review_user_note';
  await ctx.reply(REVIEW_USER_NOTE_QUESTION);
}

export function registerReviewHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('review', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReviewCommand(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'review_user_note' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleReviewUserNote(appCtx, ctx.message.text?.trim() ?? '', deps);
    }
  );
  bot.callbackQuery('notify_review', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleNotifyReview(appCtx, deps);
  });
}
