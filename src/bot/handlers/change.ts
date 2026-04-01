import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  WEEKLY_PRIORITY_CHANGE_QUESTIONS,
  type WeeklyPriorityChangeAnswerKey,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../services/week-service.js';
import type { HandlerDeps } from './deps.js';
import { renderChangeCardPng } from '../../services/change-card-render.js';

const CHANGE_EXISTING_MARKUP: import('../transport/types.js').InlineButton[][] = [[
  { text: 'Показать', callback_data: 'change_show' },
  { text: 'Изменить', callback_data: 'change_edit' },
]];

async function sendChangeAsCard(
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
    const png = await renderChangeCardPng({
      username,
      content: rawPost,
      timeHHmm,
      avatarBackgroundImage,
      rhythmLine,
    });
    if (ctx.replyImage) {
      logger.info({ userId, channel: ctx.channel }, 'Priority change card image sent');
      await ctx.replyImage(png, 'change.png');
      return;
    }
    logger.info({ userId, channel: ctx.channel }, 'Priority change card image unsupported in channel, fallback to text');
  } catch (err) {
    logger.error({ err, userId }, 'Priority change card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'change');
}

export async function handleChangeCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /change');
  ensureSession(ctx);
  ctx.session.changeEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);

  const declaration = await pool.query(
    'SELECT 1 FROM weekly_declarations WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (declaration.rows.length === 0) {
    await ctx.reply('Сначала нужно зафиксировать declaration недели. Напиши (нажми) /declaration');
    return;
  }

  const existingChange = await pool.query(
    'SELECT raw_post FROM weekly_priority_changes WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (existingChange.rows.length > 0) {
    ctx.session.step = 'change_choice';
    await ctx.reply('Смена приоритета на эту неделю уже есть.', {
      reply_markup: CHANGE_EXISTING_MARKUP,
    });
    return;
  }

  ctx.session.step = 'change_0';
  ctx.session.changeAnswers = {};
  await ctx.reply(WEEKLY_PRIORITY_CHANGE_QUESTIONS[0].text);
}

export async function handleChangeShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Change show');
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.changeAnswers = undefined;
  ctx.session.changeEditMode = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_priority_changes WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  const rawPost = row.rows[0]?.raw_post ?? '';
  await ctx.answerCallbackQuery();
  if (!rawPost.trim()) {
    await ctx.reply('Смена приоритета пуста.');
    return;
  }
  await sendChangeAsCard(ctx, deps, userId, rawPost);
}

export async function handleChangeEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Change edit');
  ensureSession(ctx);
  await ctx.answerCallbackQuery();

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const { start, end } = getWeekStartEnd(userDateStr);

  const existing = await pool.query<{ created_at: string }>(
    'SELECT created_at FROM weekly_priority_changes WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (existing.rows.length === 0) {
    await ctx.reply('Смена приоритета на эту неделю ещё не задана. Напиши (нажми) /change');
    return;
  }
  const changeCreatedAt = existing.rows[0].created_at;
  const fixAfter = await pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c
     FROM daily_fixations
     WHERE user_id = $1
       AND date >= $2 AND date <= $3
       AND created_at > $4::timestamptz`,
    [userId, start, end, changeCreatedAt]
  );
  if ((fixAfter.rows[0]?.c ?? 0) > 0) {
    await ctx.reply('⚠️ После смены приоритета уже были фиксации. Приоритет менять нельзя — он задаёт контекст для уже записанных дней.');
    return;
  }

  ctx.session.step = 'change_0';
  ctx.session.changeEditMode = true;
  ctx.session.changeAnswers = {};
  await ctx.reply(WEEKLY_PRIORITY_CHANGE_QUESTIONS[0].text);
}

export async function handleChangeMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { priorityChangeService, formatErrorForUser } = deps;
  const userId = ctx.userId;
  const step = ctx.session!.step!;
  const idx = parseInt(step.replace('change_', ''), 10);
  const answers = ctx.session!.changeAnswers ?? {};
  answers[WEEKLY_PRIORITY_CHANGE_QUESTIONS[idx].key as WeeklyPriorityChangeAnswerKey] = text;
  const record = answers as Record<WeeklyPriorityChangeAnswerKey, string>;

  if (idx >= WEEKLY_PRIORITY_CHANGE_QUESTIONS.length - 1) {
    const isEdit = ctx.session!.changeEditMode ?? false;
    ctx.session!.step = undefined;
    ctx.session!.changeAnswers = undefined;
    ctx.session!.changeEditMode = undefined;
    try {
      const { rawPost } = isEdit
        ? await priorityChangeService.updatePriorityChangeManual(userId, record)
        : await priorityChangeService.createPriorityChange(userId, record);
      logger.info({ userId, isEdit }, 'Priority change saved');
      await ctx.reply(isEdit ? '❗️ Смена приоритета обновлена.' : '❗️ Приоритет изменён.');
      await sendChangeAsCard(ctx, deps, userId, rawPost);
    } catch (err) {
      logger.error({ err, userId }, 'Priority change failed');
      ctx.alertError?.(err, 'declaration', userId);
      await ctx.reply(formatErrorForUser(err));
    }
  } else {
    ctx.session!.step = `change_${idx + 1}`;
    await ctx.reply(WEEKLY_PRIORITY_CHANGE_QUESTIONS[idx + 1].text);
  }
}

export function registerChangeHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('change', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleChangeCommand(appCtx, deps);
  });
  bot.callbackQuery('change_show', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleChangeShow(appCtx, deps);
  });
  bot.callbackQuery('change_edit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleChangeEdit(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) =>
      (ctx.session?.step?.startsWith('change_') ?? false) &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleChangeMessage(appCtx, ctx.message.text ?? '', deps);
    }
  );
}
