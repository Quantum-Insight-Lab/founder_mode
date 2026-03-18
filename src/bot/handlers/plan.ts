import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  PLANNING_QUESTIONS,
  MAIN_FOCUS_FIRST_PLANNING_HINT,
  ONBOARDING_AFTER_PLAN_1,
  ONBOARDING_AFTER_PLAN_2,
  type PlanningAnswerKey,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { formatLlmResponse } from '../../domain/html.js';
import { dateStrToWeekRef } from '../../domain/timezone.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../services/plan-service.js';
import type { HandlerDeps } from './deps.js';

export async function handlePlanCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, ensureUser, countRows, planService } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /plan');
  ensureSession(ctx);
  ctx.session.planEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
  const existing = await pool.query(
    'SELECT raw_post FROM weekly_plans WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );

  if (existing.rows.length > 0) {
    ctx.session.step = 'plan_choice';
    await ctx.reply('План на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'plan_show' },
        { text: 'Изменить', callback_data: 'plan_edit' },
      ]],
    });
    return;
  }

  ctx.session.step = 'planning_0';
  ctx.session.planningAnswers = {};
  ctx.session.isFirstPlanning = (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_plans WHERE user_id = $1', [userId])) === 0;
  funnelStarted.inc({ type: 'plan' });
  await ctx.reply(PLANNING_QUESTIONS[0].text);
}

export async function handlePlanShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, handleLlmReply } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Plan show');
  ensureSession(ctx);
  ctx.session.step = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(dateStrToWeekRef(userDateStr));
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_plans WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  const rawPost = row.rows[0]?.raw_post ?? '';
  await ctx.answerCallbackQuery();
  await ctx.reply(formatLlmResponse(rawPost) || 'План пуст.', { parse_mode: 'HTML' });
}

export async function handlePlanEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, countRows } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Plan edit');
  ensureSession(ctx);
  await ctx.answerCallbackQuery();

  const userDateStr = await getUserLocalDate(userId, pool);
  const { start, end } = getWeekStartEnd(dateStrToWeekRef(userDateStr));
  const hasReflections = (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM daily_reflections WHERE user_id = $1 AND date >= $2 AND date <= $3', [userId, start, end])) > 0;

  ctx.session.step = 'plan_edit_confirm';
  const message = hasReflections
    ? '⚠️ У тебя уже есть рефлексии на этой неделе. Изменение плана может сделать обзор неточным.\n\nПродолжить?'
    : '⚠️ GPT повторно вызываться не будет — ответы сохранятся для корректного обзора недели.\n\nПродолжить?';
  await ctx.reply(message, {
    reply_markup: [[
      { text: 'Да', callback_data: 'plan_edit_confirm_yes' },
      { text: 'Нет', callback_data: 'plan_edit_confirm_no' },
    ]],
  });
}

export async function handlePlanEditConfirmYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = 'planning_0';
  ctx.session.planEditMode = true;
  ctx.session.planningAnswers = {};
  funnelStarted.inc({ type: 'plan' });
  await ctx.answerCallbackQuery();
  await ctx.reply(PLANNING_QUESTIONS[0].text);
}

export async function handlePlanEditConfirmNo(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = undefined;
  await ctx.answerCallbackQuery();
  logger.debug({ userId: ctx.userId }, 'Plan edit cancelled');
  await ctx.reply('👌 Отменено.');
}

export async function handlePlanningMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { pool, planService, handleLlmReply, formatErrorForUser } = deps;
  const userId = ctx.userId;
  const step = ctx.session!.step!;
  const idx = parseInt(step.replace('planning_', ''), 10);
  const answers = ctx.session!.planningAnswers ?? {};
  answers[PLANNING_QUESTIONS[idx].key as PlanningAnswerKey] = text;
  const record = answers as Record<PlanningAnswerKey, string>;

  if (idx >= PLANNING_QUESTIONS.length - 1) {
    const isFirstPlanning = ctx.session?.isFirstPlanning ?? false;
    ctx.session!.step = undefined;
    ctx.session!.planningAnswers = undefined;
    const isEdit = ctx.session!.planEditMode ?? false;
    ctx.session!.planEditMode = undefined;

    try {
      if (isEdit) {
        const rawPost = await planService.updatePlanManual(userId, record);
        funnelCompleted.inc({ type: 'plan' });
        logger.info({ userId }, 'Plan manually updated');
        await ctx.reply('❗️ План обновлён.\n\n' + formatLlmResponse(rawPost?.trim() || ''), { parse_mode: 'HTML' });
      } else {
        await ctx.reply('🟢 Готовлю план...');
        const rawPost = await planService.createPlan(userId, record);
        funnelCompleted.inc({ type: 'plan' });
        logger.info({ userId }, 'Plan created');
        await handleLlmReply(ctx, rawPost ?? '', userId, 'plan');
        if (isFirstPlanning) {
          await ctx.reply(ONBOARDING_AFTER_PLAN_1);
          await ctx.reply(ONBOARDING_AFTER_PLAN_2);
        }
      }
    } catch (err) {
      logger.error({ err, userId }, isEdit ? 'Plan manual update failed' : 'Plan creation failed');
      ctx.alertError?.(err, 'plan', userId);
      await ctx.reply(formatErrorForUser(err));
    }
  } else {
    ctx.session!.step = `planning_${idx + 1}`;
    const nextIdx = idx + 1;
    let questionText = PLANNING_QUESTIONS[nextIdx].text;
    await ctx.reply(questionText);
    if (nextIdx === 1 && ctx.session?.isFirstPlanning) {
      await ctx.reply(MAIN_FOCUS_FIRST_PLANNING_HINT);
    }
  }
}

export async function handleNotifyPlan(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, countRows } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId }, 'Notify plan');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'planning_0';
  ctx.session.planningAnswers = {};
  ctx.session.planEditMode = false;
  const userDateStr = await getUserLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
  const existing = await pool.query('SELECT 1 FROM weekly_plans WHERE user_id = $1 AND week_id = $2', [userId, weekId]);
  if (existing.rows.length > 0) {
    ctx.session.step = 'plan_choice';
    await ctx.reply('План на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'plan_show' },
        { text: 'Изменить', callback_data: 'plan_edit' },
      ]],
    });
  } else {
    ctx.session.isFirstPlanning = (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_plans WHERE user_id = $1', [userId])) === 0;
    funnelStarted.inc({ type: 'plan' });
    await ctx.reply(PLANNING_QUESTIONS[0].text);
  }
}

export function registerPlanHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('plan', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handlePlanCommand(appCtx, deps);
  });
  bot.callbackQuery('plan_show', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handlePlanShow(appCtx, deps);
  });
  bot.callbackQuery('plan_edit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handlePlanEdit(appCtx, deps);
  });
  bot.callbackQuery('plan_edit_confirm_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handlePlanEditConfirmYes(appCtx, deps);
  });
  bot.callbackQuery('plan_edit_confirm_no', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handlePlanEditConfirmNo(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) =>
      (ctx.session?.step?.startsWith('planning_') ?? false) &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handlePlanningMessage(appCtx, ctx.message.text ?? '', deps);
    }
  );
  bot.callbackQuery('notify_plan', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleNotifyPlan(appCtx, deps);
  });
}
