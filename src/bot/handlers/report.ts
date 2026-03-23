import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import { REVIEW_USER_NOTE_QUESTION } from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { formatLlmResponse } from '../../domain/html.js';
import { dateStrToWeekRef } from '../../domain/timezone.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../services/plan-service.js';
import type { HandlerDeps } from './deps.js';

export async function handleReportCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /report');
  ensureSession(ctx);
  ctx.session.reportEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
  const { start, end } = getWeekStartEnd(weekRef);
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

  ctx.session.step = 'report_user_note';
  ctx.session.reportAnswers = undefined;
  funnelStarted.inc({ type: 'report' });
  await ctx.reply(REVIEW_USER_NOTE_QUESTION);
}

export async function handleReportShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Report show');
  ensureSession(ctx);
  ctx.session.step = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(dateStrToWeekRef(userDateStr));
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_reports WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  const rawPost = row.rows[0]?.raw_post ?? '';
  await ctx.answerCallbackQuery();
  await ctx.reply(formatLlmResponse(rawPost) || 'Report пуст.', { parse_mode: 'HTML' });
}

export async function handleReportEdit(ctx: AppContext): Promise<void> {
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
  ctx.session.step = 'report_user_note';
  ctx.session.reportEditMode = true;
  ctx.session.reportAnswers = undefined;
  funnelStarted.inc({ type: 'report' });
  await ctx.reply(REVIEW_USER_NOTE_QUESTION);
}

export async function handleReportMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { reportService, handleLlmReply, formatErrorForUser } = deps;
  const userId = ctx.userId;
  if (ctx.session?.step !== 'report_user_note') return;
  ctx.session.step = undefined;
  const isEdit = ctx.session.reportEditMode ?? false;
  ctx.session.reportEditMode = undefined;

  try {
    if (isEdit) {
      const rawPost = await reportService.updateReportManual(userId, text);
      funnelCompleted.inc({ type: 'report' });
      logger.info({ userId }, 'Report manually updated');
      await ctx.reply('❗️ Report обновлён.\n\n' + formatLlmResponse(rawPost?.trim() || ''), {
        parse_mode: 'HTML',
      });
    } else {
      await ctx.reply('🟢 Готовлю report...');
      const rawPost = await reportService.createReport(userId, text);
      funnelCompleted.inc({ type: 'report' });
      logger.info({ userId }, 'Report created');
      await handleLlmReply(ctx, rawPost ?? '', userId, 'report');
    }
  } catch (err) {
    logger.error({ err, userId }, isEdit ? 'Report manual update failed' : 'Report creation failed');
    ctx.alertError?.(err, 'report', userId);
    await ctx.reply(formatErrorForUser(err));
  }
}

export function registerReportHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('report', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReportCommand(appCtx, deps);
  });
  bot.callbackQuery('report_show', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReportShow(appCtx, deps);
  });
  bot.callbackQuery('report_edit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReportEdit(appCtx);
  });
  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'report_user_note' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleReportMessage(appCtx, ctx.message.text ?? '', deps);
    }
  );
}
