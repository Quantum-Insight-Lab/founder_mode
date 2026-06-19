import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import { registerGuardedCommand, registerGuardedCallback } from '../register-guard.js';
import { withProductMode } from '../with-product-mode.js';
import type { AppContext } from '../transport/types.js';
import {
  FLOW_CHOICE_USE_BUTTONS_HINT,
  LLM_PREPARING_REPORT,
  ONBOARDING_AFTER_REPORT_1,
  ONBOARDING_AFTER_REPORT_QUESTION,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { cardEditClicks, funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../services/week-service.js';
import { renderReportCardPng } from '../../services/report-card-render.js';
import type { HandlerDeps } from './deps.js';

async function sendReportAsCard(
  ctx: AppContext,
  deps: HandlerDeps,
  userId: string,
  rawPost: string
): Promise<void> {
  const { handleLlmReply, pool, resolveAvatarBackgroundImage, getRhythmLineForCard } = deps;
  const timeHHmm = await getUserLocalTimeHHmm(userId, pool);
  const username = ctx.displayName?.trim() || 'Founder';
  const avatarBackgroundImage = await resolveAvatarBackgroundImage(ctx, userId);
  const rhythmLine = (await getRhythmLineForCard(userId)) ?? undefined;
  try {
    const png = await renderReportCardPng({
      username,
      content: rawPost,
      timeHHmm,
      avatarBackgroundImage,
      rhythmLine,
    });
    if (ctx.replyImage) {
      logger.info({ userId, channel: ctx.channel }, 'Report card image sent');
      await ctx.replyImage(png, 'report.png');
      return;
    }
    logger.info({ userId, channel: ctx.channel }, 'Report card image unsupported in channel, fallback to text');
  } catch (err) {
    logger.error({ err, userId }, 'Report card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'report');
}

export async function handleReportCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, reportService, replyWithServiceError, countRows } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /report');
  ensureSession(ctx);
  ctx.session.reportEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const { start, end } = getWeekStartEnd(userDateStr);
  const existing = await pool.query(
    'SELECT raw_post FROM weekly_reports WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );

  if (existing.rows.length > 0) {
    ctx.session.step = 'report_choice';
    await ctx.reply('Report на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'report_show' },
        { text: 'Изменить', callback_data: 'report_edit' },
      ]],
    });
    return;
  }

  const declaration = await pool.query(
    'SELECT 1 FROM weekly_declarations WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (declaration.rows.length === 0) {
    await ctx.reply('Сначала нужно зафиксировать declaration недели. Напиши (нажми) /declaration');
    return;
  }

  const reflections = await pool.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM daily_fixations WHERE user_id = $1 AND date >= $2 AND date <= $3',
    [userId, start, end]
  );
  const reflectionsCount = reflections.rows[0]?.total ?? 0;
  if (reflectionsCount === 0) {
    await ctx.reply('Сначала нужно зафиксировать хотя бы одну фиксацию недели. Напиши (нажми) /fixation');
    return;
  }

  funnelStarted.inc({ type: 'report' });
  const wasFirstReport =
    (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_reports WHERE user_id = $1', [userId])) === 0;
  try {
    await ctx.reply(LLM_PREPARING_REPORT);
    const rawPost = await reportService.createReport(userId);
    funnelCompleted.inc({ type: 'report' });
    logger.info({ userId }, 'Report created');
    await sendReportAsCard(ctx, deps, userId, rawPost ?? '');
    if (wasFirstReport) {
      await ctx.reply(ONBOARDING_AFTER_REPORT_1);
      await ctx.reply(ONBOARDING_AFTER_REPORT_QUESTION, {
        reply_markup: [[
          { text: 'Да', callback_data: 'onboard_report_cta_yes' },
          { text: 'Позже', callback_data: 'onboard_report_cta_later' },
        ]],
      });
      ensureSession(ctx);
      ctx.session.step = 'onboard_report_cta';
    }
  } catch (err) {
    logger.error({ err, userId }, 'Report creation failed');
    ctx.alertError?.(err, 'report', userId);
    await replyWithServiceError(ctx, err, userId, 'report');
  }
}

export async function handleReportShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Report show');
  ensureSession(ctx);
  ctx.session.step = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_reports WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  const rawPost = row.rows[0]?.raw_post ?? '';
  await ctx.answerCallbackQuery();
  if (!rawPost.trim()) {
    await ctx.reply('Report пуст.');
    return;
  }
  await sendReportAsCard(ctx, deps, userId, rawPost);
}

export async function handleNotifyReport(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  return handleReportCommand(ctx, deps);
}

export async function handleReportEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { reportService, replyWithServiceError } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'report' });
  funnelStarted.inc({ type: 'report' });
  try {
    await ctx.reply(LLM_PREPARING_REPORT);
    const rawPost = await reportService.updateReportManual(userId);
    funnelCompleted.inc({ type: 'report' });
    logger.info({ userId }, 'Report manually updated');
    await ctx.reply('❗️ Отчёт обновлён.');
    await sendReportAsCard(ctx, deps, userId, rawPost ?? '');
  } catch (err) {
    logger.error({ err, userId }, 'Report manual update failed');
    ctx.alertError?.(err, 'report', userId);
    await replyWithServiceError(ctx, err, userId, 'report');
  }
}

export function registerReportHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  registerGuardedCommand(bot, deps, 'founder', 'report', handleReportCommand);
  registerGuardedCallback(bot, deps, 'founder', 'report_show', handleReportShow);
  registerGuardedCallback(bot, deps, 'founder', 'report_edit', handleReportEdit);
  registerGuardedCallback(bot, deps, 'founder', 'notify_report', handleNotifyReport);
  bot.on('message:text').filter(
    (ctx) => ctx.session?.step === 'report_choice' && !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await withProductMode('founder', async (c) => {
        await c.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
      })(appCtx, deps);
    }
  );
}
