import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import {
  PLANNING_QUESTIONS,
  MAIN_FOCUS_FIRST_PLANNING_HINT,
  type PlanningAnswerKey,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { notifyDeveloper } from '../../observability/alert.js';
import { formatLlmResponse } from '../../domain/html.js';
import { dateStrToWeekRef } from '../../domain/timezone.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../services/plan-service.js';
import type { HandlerDeps } from './deps.js';

export function registerPlanHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  const { pool, ensureUser, formatErrorForUser, handleLlmReply, countRows, planService } = deps;

  bot.command('plan', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.info({ tgId }, 'Command /plan');
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
        reply_markup: new InlineKeyboard()
          .text('Показать', 'plan_show')
          .text('Изменить', 'plan_edit'),
      });
      return;
    }

    ctx.session.step = 'planning_0';
    ctx.session.planningAnswers = {};
    ctx.session.isFirstPlanning = (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_plans WHERE user_id = $1', [userId])) === 0;
    funnelStarted.inc({ type: 'plan' });
    await ctx.reply(PLANNING_QUESTIONS[0].text);
  });

  bot.callbackQuery('plan_show', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
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
  });

  bot.callbackQuery('plan_edit', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
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
      reply_markup: new InlineKeyboard().text('Да', 'plan_edit_confirm_yes').text('Нет', 'plan_edit_confirm_no'),
    });
  });

  bot.callbackQuery('plan_edit_confirm_yes', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.debug({ userId }, 'Plan edit confirm yes');
    ensureSession(ctx);
    ctx.session.step = 'planning_0';
    ctx.session.planEditMode = true;
    ctx.session.planningAnswers = {};
    funnelStarted.inc({ type: 'plan' });
    await ctx.answerCallbackQuery();
    await ctx.reply(PLANNING_QUESTIONS[0].text);
  });

  bot.callbackQuery('plan_edit_confirm_no', async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    ensureSession(ctx);
    ctx.session.step = undefined;
    await ctx.answerCallbackQuery();
    logger.debug({ userId }, 'Plan edit cancelled');
    await ctx.reply('👌 Отменено.');
  });

  bot.on('message:text').filter(
    (ctx) =>
      (ctx.session?.step?.startsWith('planning_') ?? false) &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const step = ctx.session!.step!;
    const idx = parseInt(step.replace('planning_', ''), 10);
    const answers = ctx.session!.planningAnswers ?? {};
    answers[PLANNING_QUESTIONS[idx].key as PlanningAnswerKey] = ctx.message.text;
    const record = answers as Record<PlanningAnswerKey, string>;

    if (idx >= PLANNING_QUESTIONS.length - 1) {
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
        }
      } catch (err) {
        logger.error({ err, userId }, isEdit ? 'Plan manual update failed' : 'Plan creation failed');
        notifyDeveloper(ctx.api, err, 'plan', userId);
        await ctx.reply(formatErrorForUser(err));
      }
    } else {
      ctx.session!.step = `planning_${idx + 1}`;
      const nextIdx = idx + 1;
      let questionText = PLANNING_QUESTIONS[nextIdx].text;
      if (nextIdx === 1 && ctx.session?.isFirstPlanning) {
        questionText += `\n\n<i>${MAIN_FOCUS_FIRST_PLANNING_HINT}</i>`;
      }
      await ctx.reply(questionText, nextIdx === 1 ? { parse_mode: 'HTML' } : undefined);
    }
  });

  bot.callbackQuery('notify_plan', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.info({ tgId, userId }, 'Notify plan');
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
        reply_markup: new InlineKeyboard().text('Показать', 'plan_show').text('Изменить', 'plan_edit'),
      });
    } else {
      ctx.session.isFirstPlanning = (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_plans WHERE user_id = $1', [userId])) === 0;
      funnelStarted.inc({ type: 'plan' });
      await ctx.reply(PLANNING_QUESTIONS[0].text);
    }
  });
}
