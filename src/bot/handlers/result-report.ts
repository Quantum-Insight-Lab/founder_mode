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

export async function handleResultReportCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /result_report');
  ensureSession(ctx);
  ctx.session.resultReportEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
  const { start, end } = getWeekStartEnd(weekRef);
  const existing = await pool.query(
    'SELECT raw_post FROM weekly_result_reports WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );

  if (existing.rows.length > 0) {
    ctx.session.step = 'result_report_choice';
    await ctx.reply('Result Report на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'result_report_show' },
        { text: 'Изменить', callback_data: 'result_report_edit' },
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
    'SELECT COUNT(*)::int AS total FROM daily_reflections WHERE user_id = $1 AND date >= $2 AND date <= $3',
    [userId, start, end]
  );
  const reflectionsCount = reflections.rows[0]?.total ?? 0;
  if (reflectionsCount === 0) {
    await ctx.reply('Сначала нужно зафиксировать хотя бы одну рефлексию недели. Напиши (нажми) /reflect');
    return;
  }

  ctx.session.step = 'result_report_user_note';
  ctx.session.resultReportAnswers = undefined;
  funnelStarted.inc({ type: 'result_report' });
  await ctx.reply(REVIEW_USER_NOTE_QUESTION);
}

export async function handleResultReportShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Result report show');
  ensureSession(ctx);
  ctx.session.step = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(dateStrToWeekRef(userDateStr));
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_result_reports WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  const rawPost = row.rows[0]?.raw_post ?? '';
  await ctx.answerCallbackQuery();
  await ctx.reply(formatLlmResponse(rawPost) || 'Result Report пуст.', { parse_mode: 'HTML' });
}

export async function handleResultReportEdit(ctx: AppContext): Promise<void> {
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
  ctx.session.step = 'result_report_user_note';
  ctx.session.resultReportEditMode = true;
  ctx.session.resultReportAnswers = undefined;
  funnelStarted.inc({ type: 'result_report' });
  await ctx.reply(REVIEW_USER_NOTE_QUESTION);
}

export async function handleResultReportMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { resultReportService, handleLlmReply, formatErrorForUser } = deps;
  const userId = ctx.userId;
  if (ctx.session?.step !== 'result_report_user_note') return;
  ctx.session.step = undefined;
  const isEdit = ctx.session.resultReportEditMode ?? false;
  ctx.session.resultReportEditMode = undefined;

  try {
    if (isEdit) {
      const rawPost = await resultReportService.updateResultReportManual(userId, text);
      funnelCompleted.inc({ type: 'result_report' });
      logger.info({ userId }, 'Result report manually updated');
      await ctx.reply('❗️ Result Report обновлён.\n\n' + formatLlmResponse(rawPost?.trim() || ''), {
        parse_mode: 'HTML',
      });
    } else {
      await ctx.reply('🟢 Готовлю result report...');
      const rawPost = await resultReportService.createResultReport(userId, text);
      funnelCompleted.inc({ type: 'result_report' });
      logger.info({ userId }, 'Result report created');
      await handleLlmReply(ctx, rawPost ?? '', userId, 'result_report');
    }
  } catch (err) {
    logger.error({ err, userId }, isEdit ? 'Result report manual update failed' : 'Result report creation failed');
    ctx.alertError?.(err, 'result_report', userId);
    await ctx.reply(formatErrorForUser(err));
  }
}

export function registerResultReportHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('result_report', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleResultReportCommand(appCtx, deps);
  });
  bot.callbackQuery('result_report_show', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleResultReportShow(appCtx, deps);
  });
  bot.callbackQuery('result_report_edit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleResultReportEdit(appCtx);
  });
  bot.on('message:text').filter(
    (ctx) =>
      ctx.session?.step === 'result_report_user_note' &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleResultReportMessage(appCtx, ctx.message.text ?? '', deps);
    }
  );
}
