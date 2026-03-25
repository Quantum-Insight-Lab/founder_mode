import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  DECLARATION_EDIT_BLOCKED_HAS_FIXATIONS,
  ONBOARDING_AFTER_PLAN_1,
  ONBOARDING_AFTER_PLAN_2,
} from '../conversations.js';
import { WEEKLY_DECLARATION_QUESTIONS, type WeeklyDeclarationAnswerKey } from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../services/week-service.js';
import { renderDeclarationCardPng } from '../../services/declaration-card-render.js';
import type { HandlerDeps } from './deps.js';

async function sendDeclarationAsCard(
  ctx: AppContext,
  deps: HandlerDeps,
  userId: string,
  rawPost: string
): Promise<void> {
  const { handleLlmReply, pool, resolveAvatarBackgroundImage } = deps;
  const timeHHmm = await getUserLocalTimeHHmm(userId, pool);
  const username = ctx.displayName?.trim() || 'Founder';
  const avatarBackgroundImage = await resolveAvatarBackgroundImage(ctx, userId);
  try {
    const png = await renderDeclarationCardPng({
      username,
      content: rawPost,
      timeHHmm,
      avatarBackgroundImage,
    });
    if (ctx.replyImage) {
      logger.info({ userId, channel: ctx.channel }, 'Declaration card image sent');
      await ctx.replyImage(png, 'declaration.png');
      return;
    }
    logger.info({ userId, channel: ctx.channel }, 'Declaration card image unsupported in channel, fallback to text');
  } catch (err) {
    logger.error({ err, userId }, 'Declaration card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'declaration');
}

export async function handleDeclarationCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, countRows } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /declaration');
  ensureSession(ctx);
  ctx.session.declarationEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const existing = await pool.query(
    'SELECT raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );

  if (existing.rows.length > 0) {
    ctx.session.isFirstDeclaration = undefined;
    ctx.session.step = 'declaration_choice';
    await ctx.reply('Declaration на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'declaration_show' },
        { text: 'Изменить', callback_data: 'declaration_edit' },
      ]],
    });
    return;
  }

  ctx.session.step = 'declaration_0';
  ctx.session.declarationAnswers = {};
  ctx.session.isFirstDeclaration =
    (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_declarations WHERE user_id = $1', [userId])) === 0;
  funnelStarted.inc({ type: 'declaration' });
  await ctx.reply(WEEKLY_DECLARATION_QUESTIONS[0].text);
}

export async function handleDeclarationShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Declaration show');
  ensureSession(ctx);
  ctx.session.step = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  const r = row.rows[0];
  await ctx.answerCallbackQuery();
  if (!r?.raw_post?.trim()) {
    await ctx.reply('Declaration пуст.');
    return;
  }
  await sendDeclarationAsCard(ctx, deps, userId, r.raw_post);
}

export async function handleDeclarationEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, countRows } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Declaration edit');
  ensureSession(ctx);
  await ctx.answerCallbackQuery();

  const userDateStr = await getUserLocalDate(userId, pool);
  const { start, end } = getWeekStartEnd(userDateStr);
  const hasFixations =
    (await countRows(
      pool,
      'SELECT COUNT(*)::int AS c FROM daily_fixations WHERE user_id = $1 AND date >= $2 AND date <= $3',
      [userId, start, end]
    )) > 0;

  if (hasFixations) {
    await ctx.reply(DECLARATION_EDIT_BLOCKED_HAS_FIXATIONS);
    return;
  }

  ctx.session.isFirstDeclaration = undefined;
  ctx.session.step = 'declaration_0';
  ctx.session.declarationEditMode = true;
  ctx.session.declarationAnswers = {};
  funnelStarted.inc({ type: 'declaration' });
  await ctx.reply(WEEKLY_DECLARATION_QUESTIONS[0].text);
}

export async function handleDeclarationMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { declarationService, handleLlmReply, formatErrorForUser } = deps;
  const userId = ctx.userId;
  const step = ctx.session!.step!;
  const idx = parseInt(step.replace('declaration_', ''), 10);
  const answers = ctx.session!.declarationAnswers ?? {};
  answers[WEEKLY_DECLARATION_QUESTIONS[idx].key as WeeklyDeclarationAnswerKey] = text;
  const record = answers as Record<WeeklyDeclarationAnswerKey, string>;

  if (idx >= WEEKLY_DECLARATION_QUESTIONS.length - 1) {
    const isFirstDeclaration = ctx.session?.isFirstDeclaration ?? false;
    ctx.session!.step = undefined;
    ctx.session!.declarationAnswers = undefined;
    const isEdit = ctx.session!.declarationEditMode ?? false;
    ctx.session!.declarationEditMode = undefined;
    ctx.session!.isFirstDeclaration = undefined;

    try {
      if (isEdit) {
        const { rawPost } = await declarationService.updateDeclarationManual(userId, record);
        funnelCompleted.inc({ type: 'declaration' });
        logger.info({ userId }, 'Declaration manually updated');
        await ctx.reply('❗️ Declaration обновлён.');
        await sendDeclarationAsCard(ctx, deps, userId, rawPost);
      } else {
        const { rawPost } = await declarationService.createDeclaration(userId, record);
        funnelCompleted.inc({ type: 'declaration' });
        logger.info({ userId }, 'Declaration created');
        await sendDeclarationAsCard(ctx, deps, userId, rawPost);
        if (isFirstDeclaration) {
          await ctx.reply(ONBOARDING_AFTER_PLAN_1);
          await ctx.reply(`<i>${ONBOARDING_AFTER_PLAN_2}</i>`, { parse_mode: 'HTML' });
        }
      }
    } catch (err) {
      logger.error({ err, userId }, isEdit ? 'Declaration manual update failed' : 'Declaration creation failed');
      ctx.alertError?.(err, 'declaration', userId);
      await ctx.reply(formatErrorForUser(err));
    }
  } else {
    ctx.session!.step = `declaration_${idx + 1}`;
    await ctx.reply(WEEKLY_DECLARATION_QUESTIONS[idx + 1].text);
  }
}

export async function handleNotifyDeclaration(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, countRows } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId }, 'Notify declaration');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.declarationEditMode = false;
  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const existing = await pool.query(
    'SELECT 1 FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  if (existing.rows.length > 0) {
    ctx.session.isFirstDeclaration = undefined;
    ctx.session.step = 'declaration_choice';
    await ctx.reply('Declaration на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'declaration_show' },
        { text: 'Изменить', callback_data: 'declaration_edit' },
      ]],
    });
  } else {
    ctx.session.step = 'declaration_0';
    ctx.session.declarationAnswers = {};
    ctx.session.isFirstDeclaration =
      (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_declarations WHERE user_id = $1', [userId])) === 0;
    funnelStarted.inc({ type: 'declaration' });
    await ctx.reply(WEEKLY_DECLARATION_QUESTIONS[0].text);
  }
}

export function registerDeclarationHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('declaration', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeclarationCommand(appCtx, deps);
  });
  bot.callbackQuery('declaration_show', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeclarationShow(appCtx, deps);
  });
  bot.callbackQuery('declaration_edit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleDeclarationEdit(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) =>
      (ctx.session?.step?.startsWith('declaration_') ?? false) &&
      !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleDeclarationMessage(appCtx, ctx.message.text ?? '', deps);
    }
  );
  bot.callbackQuery('notify_declaration', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleNotifyDeclaration(appCtx, deps);
  });
}
