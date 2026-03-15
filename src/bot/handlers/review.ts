import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { REVIEW_USER_NOTE_QUESTION } from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { notifyDeveloper } from '../../observability/alert.js';
import { validateReviewMinDataFromMeta } from '../../domain/validators.js';
import { dateStrToWeekRef } from '../../domain/timezone.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { config } from '../../config/index.js';
import { getWeekId, getWeekStartEnd } from '../../services/plan-service.js';
import type { HandlerDeps } from './deps.js';

export function registerReviewHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  const { pool, ensureUser, formatErrorForUser, handleLlmReply, reviewService } = deps;

  async function runReviewWithNote(ctx: BotContext, optionalUserNote: string, prevalidated: boolean) {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    ensureSession(ctx);
    ctx.session.step = undefined;
    await ctx.reply('🟢 Готовлю обзор...');
    try {
      const result = await reviewService.generateReview(userId, undefined, optionalUserNote, prevalidated);
      funnelCompleted.inc({ type: 'review' });
      logger.info({ userId }, 'Review generated');
      await handleLlmReply(ctx, result.content ?? '', userId, 'review');
    } catch (err) {
      logger.error({ err, userId }, 'Review generation failed');
      notifyDeveloper(ctx.api, err, 'review', userId);
      await ctx.reply(formatErrorForUser(err));
    }
  }

  bot.command('review', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.info({ tgId }, 'Command /review');
    const userDateStr = await getUserLocalDate(userId, pool);
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
      notifyDeveloper(ctx.api, err, 'review(precheck)', userId);
      await ctx.reply(formatErrorForUser(err));
      return;
    }
    const useSoftPrompt = (meta?.ref_count ?? 0) < minReflections;

    funnelStarted.inc({ type: 'review' });
    if (useSoftPrompt) {
      await runReviewWithNote(ctx, '', true);
      return;
    }
    ensureSession(ctx);
    ctx.session.step = 'review_user_note';
    await ctx.reply(REVIEW_USER_NOTE_QUESTION);
  });

  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'review_user_note' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
    const note = ctx.message.text?.trim() ?? '';
    await runReviewWithNote(ctx, note, true);
  });

  bot.callbackQuery('notify_review', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.info({ tgId, userId }, 'Notify review');
    await ctx.answerCallbackQuery();
    const userDateStr = await getUserLocalDate(userId, pool);
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
      notifyDeveloper(ctx.api, err, 'review(precheck)', userId);
      await ctx.reply(formatErrorForUser(err));
      return;
    }
    const useSoftPrompt = (meta?.ref_count ?? 0) < minReflections;
    funnelStarted.inc({ type: 'review' });
    if (useSoftPrompt) {
      logger.debug({ userId, useSoftPrompt }, 'Notify review: direct run');
      await runReviewWithNote(ctx, '', true);
      return;
    }
    logger.debug({ userId }, 'Notify review: showing question');
    ensureSession(ctx);
    ctx.session.step = 'review_user_note';
    await ctx.reply(REVIEW_USER_NOTE_QUESTION);
  });
}
