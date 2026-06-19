import type { Bot } from 'grammy';
import type { BotContext } from '../../context.js';
import { ensureSession } from '../../context.js';
import { buildAppContext } from '../../transport/telegram-adapter.js';
import { registerGuardedCommand, registerGuardedCallback } from '../../register-guard.js';
import { withProductMode } from '../../with-product-mode.js';
import type { AppContext } from '../../transport/types.js';
import {
  FLOW_CHOICE_USE_BUTTONS_HINT,
  LLM_PREPARING_SWITCH,
  MATTER_SWITCH_QUESTIONS,
  type MatterSwitchAnswerKey,
} from '../../closure-conversations.js';
import { logger } from '../../../observability/logger.js';
import { cardEditClicks, funnelCompleted, funnelStarted } from '../../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../../services/week-service.js';
import { renderSwitchCardPng } from '../../../services/switch-card-render.js';
import type { HandlerDeps } from '../deps.js';

const SWITCH_EXISTING_MARKUP: import('../../transport/types.js').InlineButton[][] = [[
  { text: 'Показать', callback_data: 'switch_show' },
  { text: 'Изменить', callback_data: 'switch_edit' },
]];

async function sendSwitchAsCard(
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
    const png = await renderSwitchCardPng({
      username,
      content: rawPost,
      timeHHmm,
      avatarBackgroundImage,
      rhythmLine,
    });
    if (ctx.replyImage) {
      await ctx.replyImage(png, 'switch.png');
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'Switch card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'switch');
}

export async function handleSwitchCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /switch');
  ensureSession(ctx);
  ctx.session.switchEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);

  const matter = await pool.query(
    'SELECT 1 FROM weekly_matters WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (matter.rows.length === 0) {
    await ctx.reply('Сначала выбери дело недели: /matter');
    return;
  }

  const existingSwitch = await pool.query(
    'SELECT raw_post FROM matter_switches WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (existingSwitch.rows.length > 0) {
    ctx.session.step = 'switch_choice';
    await ctx.reply('Смена дела на эту неделю уже есть.', { reply_markup: SWITCH_EXISTING_MARKUP });
    return;
  }

  funnelStarted.inc({ type: 'switch' });
  ctx.session.step = 'switch_0';
  ctx.session.switchAnswers = {};
  await ctx.reply(MATTER_SWITCH_QUESTIONS[0].text);
}

export async function handleSwitchShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.switchAnswers = undefined;
  ctx.session.switchEditMode = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM matter_switches WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  await ctx.answerCallbackQuery();
  const rawPost = row.rows[0]?.raw_post ?? '';
  if (!rawPost.trim()) {
    await ctx.reply('Смена дела пуста.');
    return;
  }
  await sendSwitchAsCard(ctx, deps, userId, rawPost);
}

export async function handleSwitchEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'switch' });

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const { start, end } = getWeekStartEnd(userDateStr);

  const existing = await pool.query<{ created_at: string }>(
    'SELECT created_at FROM matter_switches WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (existing.rows.length === 0) {
    await ctx.reply('Смена дела на эту неделю ещё не задана. Напиши /switch');
    return;
  }
  const changeCreatedAt = existing.rows[0].created_at;
  const stepsAfter = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
     FROM matter_steps
     WHERE user_id = $1 AND date >= $2 AND date <= $3 AND created_at > $4::timestamptz`,
    [userId, start, end, changeCreatedAt]
  );
  if ((stepsAfter.rows[0]?.c ?? 0) > 0) {
    await ctx.reply('⚠️ После смены дела уже были шаги. Менять нельзя.');
    return;
  }

  ctx.session.step = 'switch_0';
  ctx.session.switchEditMode = true;
  ctx.session.switchAnswers = {};
  await ctx.reply(MATTER_SWITCH_QUESTIONS[0].text);
}

export async function handleSwitchMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { matterSwitchService, replyWithServiceError } = deps;
  const userId = ctx.userId;
  const step = ctx.session!.step!;
  if (step === 'switch_choice') {
    if (!text.trim().startsWith('/')) await ctx.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
    return;
  }
  const idx = parseInt(step.replace('switch_', ''), 10);
  const answers = ctx.session!.switchAnswers ?? {};
  answers[MATTER_SWITCH_QUESTIONS[idx].key as MatterSwitchAnswerKey] = text;
  const record = answers as Record<MatterSwitchAnswerKey, string>;

  if (idx >= MATTER_SWITCH_QUESTIONS.length - 1) {
    const isEdit = ctx.session!.switchEditMode ?? false;
    ctx.session!.step = undefined;
    ctx.session!.switchAnswers = undefined;
    ctx.session!.switchEditMode = undefined;
    try {
      await ctx.reply(LLM_PREPARING_SWITCH);
      const { rawPost } = isEdit
        ? await matterSwitchService.updateMatterSwitchManual(userId, record)
        : await matterSwitchService.createMatterSwitch(userId, record);
      funnelCompleted.inc({ type: 'switch' });
      await ctx.reply(isEdit ? '❗️ Смена дела обновлена.' : '❗️ Дело изменено.');
      await sendSwitchAsCard(ctx, deps, userId, rawPost);
    } catch (err) {
      logger.error({ err, userId }, 'Matter switch failed');
      ctx.alertError?.(err, 'switch', userId);
      await replyWithServiceError(ctx, err, userId, 'switch');
    }
  } else {
    ctx.session!.step = `switch_${idx + 1}`;
    await ctx.reply(MATTER_SWITCH_QUESTIONS[idx + 1].text);
  }
}

export function registerSwitchHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  registerGuardedCommand(bot, deps, 'closure', 'switch', handleSwitchCommand);
  registerGuardedCallback(bot, deps, 'closure', 'switch_show', handleSwitchShow);
  registerGuardedCallback(bot, deps, 'closure', 'switch_edit', handleSwitchEdit);
  bot.on('message:text').filter(
    (ctx) =>
      (ctx.session?.step?.match(/^switch_(\d+|choice)$/) ?? false) &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await withProductMode('closure', (c, d) => handleSwitchMessage(c, ctx.message.text ?? '', d))(appCtx, deps);
    }
  );
}
