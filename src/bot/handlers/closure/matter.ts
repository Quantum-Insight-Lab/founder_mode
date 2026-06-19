import type { Bot } from 'grammy';
import type { BotContext } from '../../context.js';
import { ensureSession } from '../../context.js';
import { buildAppContext } from '../../transport/telegram-adapter.js';
import { registerGuardedCommand, registerGuardedCallback } from '../../register-guard.js';
import { withProductMode } from '../../with-product-mode.js';
import type { AppContext } from '../../transport/types.js';
import {
  CLOSURE_MATTER_TITLE_QUESTION,
  CLOSURE_MATTER_AREA_QUESTION,
  CLOSURE_MATTER_AREA_OTHER_QUESTION,
  CLOSURE_ONBOARDING_AFTER_MATTER_1,
  CLOSURE_ONBOARDING_AFTER_MATTER_2,
  FLOW_CHOICE_USE_BUTTONS_HINT,
  LLM_PREPARING_MATTER,
  MATTER_AREAS,
  MATTER_EDIT_BLOCKED_HAS_STEPS,
  MATTER_FOLLOWUP_QUESTIONS,
  type MatterFollowupAnswerKey,
} from '../../closure-conversations.js';
import { logger } from '../../../observability/logger.js';
import { cardEditClicks, funnelCompleted, funnelStarted } from '../../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../../services/week-service.js';
import { renderMatterCardPng } from '../../../services/matter-card-render.js';
import type { HandlerDeps } from '../deps.js';

function areaButtonsMarkup(): import('../../transport/types.js').InlineButton[][] {
  const rows: import('../../transport/types.js').InlineButton[][] = [];
  for (let i = 0; i < MATTER_AREAS.length; i += 2) {
    const row = MATTER_AREAS.slice(i, i + 2).map((a) => ({
      text: a.label,
      callback_data: `matter_area_${a.key}`,
    }));
    rows.push(row);
  }
  return rows;
}

async function sendMatterAsCard(
  ctx: AppContext,
  deps: HandlerDeps,
  userId: string,
  rawPost: string
): Promise<void> {
  const { handleLlmReply, pool, resolveAvatarBackgroundImage, getRhythmLineForCard } = deps;
  const timeHHmm = await getUserLocalTimeHHmm(userId, pool);
  const username = ctx.displayName?.trim() || 'User';
  const avatarBackgroundImage = await resolveAvatarBackgroundImage(ctx, userId);
  const rhythmLine = (await getRhythmLineForCard(userId)) ?? undefined;
  try {
    const png = await renderMatterCardPng({
      username,
      content: rawPost,
      timeHHmm,
      avatarBackgroundImage,
      rhythmLine,
    });
    if (ctx.replyImage) {
      logger.info({ userId, channel: ctx.channel }, 'Matter card image sent');
      await ctx.replyImage(png, 'matter.png');
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'Matter card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'matter');
}

export async function handleMatterCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, countRows } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /matter');
  ensureSession(ctx);
  ctx.session.matterEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const existing = await pool.query(
    'SELECT raw_post FROM weekly_matters WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );

  if (existing.rows.length > 0) {
    ctx.session.isFirstMatter = undefined;
    ctx.session.step = 'matter_choice';
    await ctx.reply('Дело на эту неделю уже выбрано.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'matter_show' },
        { text: 'Изменить', callback_data: 'matter_edit' },
      ]],
    });
    return;
  }

  ctx.session.step = 'matter_title';
  ctx.session.matterAnswers = {};
  ctx.session.isFirstMatter =
    (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_matters WHERE user_id = $1', [userId])) === 0;
  funnelStarted.inc({ type: 'matter' });
  await ctx.reply(CLOSURE_MATTER_TITLE_QUESTION);
}

export async function handleMatterShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  ctx.session.step = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_matters WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  await ctx.answerCallbackQuery();
  const rawPost = row.rows[0]?.raw_post ?? '';
  if (!rawPost.trim()) {
    await ctx.reply('Дело недели пусто.');
    return;
  }
  await sendMatterAsCard(ctx, deps, userId, rawPost);
}

export async function handleMatterEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, countRows } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'matter' });

  const userDateStr = await getUserLocalDate(userId, pool);
  const { start, end } = getWeekStartEnd(userDateStr);
  const hasSteps =
    (await countRows(
      pool,
      'SELECT COUNT(*)::int AS c FROM matter_steps WHERE user_id = $1 AND date >= $2 AND date <= $3',
      [userId, start, end]
    )) > 0;

  if (hasSteps) {
    await ctx.reply(MATTER_EDIT_BLOCKED_HAS_STEPS);
    return;
  }

  ctx.session.isFirstMatter = undefined;
  ctx.session.step = 'matter_title';
  ctx.session.matterEditMode = true;
  ctx.session.matterAnswers = {};
  funnelStarted.inc({ type: 'matter' });
  await ctx.reply(CLOSURE_MATTER_TITLE_QUESTION);
}

export async function handleMatterAreaChoice(ctx: AppContext, areaKey: string, deps: HandlerDeps): Promise<void> {
  const area = MATTER_AREAS.find((a) => a.key === areaKey);
  if (!area) return;
  ensureSession(ctx);
  ctx.session.matterAnswers ??= {};
  ctx.session.matterAnswers.area_key = areaKey;
  await ctx.answerCallbackQuery();
  if (areaKey === 'other') {
    ctx.session.step = 'matter_area_other';
    await ctx.reply(CLOSURE_MATTER_AREA_OTHER_QUESTION);
    return;
  }
  ctx.session.step = 'matter_1';
  await ctx.reply(MATTER_FOLLOWUP_QUESTIONS[0].text);
}

export async function handleMatterMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { matterService, replyWithServiceError } = deps;
  const userId = ctx.userId;
  const step = ctx.session!.step!;
  if (step === 'matter_choice') {
    if (!text.trim().startsWith('/')) await ctx.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
    return;
  }

  if (step === 'matter_title') {
    ctx.session!.matterAnswers ??= {};
    ctx.session!.matterAnswers.title = text;
    ctx.session!.step = 'matter_area';
    await ctx.reply(CLOSURE_MATTER_AREA_QUESTION, { reply_markup: areaButtonsMarkup() });
    return;
  }

  if (step === 'matter_area_other') {
    ctx.session!.matterAnswers ??= {};
    ctx.session!.matterAnswers.area_custom = text.trim();
    ctx.session!.step = 'matter_1';
    await ctx.reply(MATTER_FOLLOWUP_QUESTIONS[0].text);
    return;
  }

  const idx = parseInt(step.replace('matter_', ''), 10);
  if (Number.isNaN(idx)) return;

  const answers = ctx.session!.matterAnswers ?? {};
  answers[MATTER_FOLLOWUP_QUESTIONS[idx - 1].key as MatterFollowupAnswerKey] = text;

  if (idx >= MATTER_FOLLOWUP_QUESTIONS.length) {
    const isFirstMatter = ctx.session?.isFirstMatter ?? false;
    ctx.session!.step = undefined;
    const isEdit = ctx.session!.matterEditMode ?? false;
    ctx.session!.matterAnswers = undefined;
    ctx.session!.matterEditMode = undefined;
    ctx.session!.isFirstMatter = undefined;

    const record = {
      title: answers.title ?? '',
      area_key: answers.area_key ?? '',
      area_custom: answers.area_custom ?? null,
      why_postponed: answers.why_postponed ?? '',
      cost_of_inaction: answers.cost_of_inaction ?? '',
      week_target: answers.week_target ?? '',
    };

    try {
      await ctx.reply(LLM_PREPARING_MATTER);
      if (isEdit) {
        const { rawPost } = await matterService.updateMatterManual(userId, record);
        funnelCompleted.inc({ type: 'matter' });
        await ctx.reply('❗️ Дело недели обновлено.');
        await sendMatterAsCard(ctx, deps, userId, rawPost);
      } else {
        const { rawPost } = await matterService.createMatter(userId, record);
        funnelCompleted.inc({ type: 'matter' });
        await sendMatterAsCard(ctx, deps, userId, rawPost);
        if (isFirstMatter) {
          await ctx.reply(CLOSURE_ONBOARDING_AFTER_MATTER_1);
          await ctx.reply(`<i>${CLOSURE_ONBOARDING_AFTER_MATTER_2}</i>`, { parse_mode: 'HTML' });
        }
      }
    } catch (err) {
      logger.error({ err, userId }, isEdit ? 'Matter manual update failed' : 'Matter creation failed');
      ctx.alertError?.(err, 'matter', userId);
      await replyWithServiceError(ctx, err, userId, 'matter');
    }
  } else {
    ctx.session!.step = `matter_${idx + 1}`;
    await ctx.reply(MATTER_FOLLOWUP_QUESTIONS[idx].text);
  }
}

export async function handleNotifyMatter(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId }, 'Notify matter');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.matterEditMode = false;
  return handleMatterCommand(ctx, deps);
}

export function registerMatterHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  registerGuardedCommand(bot, deps, 'closure', 'matter', handleMatterCommand);
  registerGuardedCallback(bot, deps, 'closure', 'matter_show', handleMatterShow);
  registerGuardedCallback(bot, deps, 'closure', 'matter_edit', handleMatterEdit);
  registerGuardedCallback(bot, deps, 'closure', 'notify_matter', handleNotifyMatter);
  bot.callbackQuery(/^matter_area_(.+)$/, async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    const m = ctx.callbackQuery.data.match(/^matter_area_(.+)$/);
    if (m) {
      await withProductMode('closure', (c, d) => handleMatterAreaChoice(c, m[1], d))(appCtx, deps);
    }
  });
  bot.on('message:text').filter(
    (ctx) =>
      (ctx.session?.step?.match(/^matter_(title|area_other|\d+|choice)$/) ?? false) &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await withProductMode('closure', (c, d) => handleMatterMessage(c, ctx.message.text ?? '', d))(appCtx, deps);
    }
  );
}
