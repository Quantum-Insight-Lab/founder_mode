import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  WEEKLY_DECLARATION_QUESTIONS,
  type WeeklyDeclarationAnswerKey,
} from '../conversations2.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { dateStrToWeekRef } from '../../domain/timezone.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../db/user-timezone.js';
import { getWeekId } from '../../services/plan-service.js';
import { renderDeclarationCardPng } from '../../services/declaration-card-render.js';
import type { DeclarationStructured } from '../../services/declaration-service.js';
import type { HandlerDeps } from './deps.js';

function dbg(location: string, message: string, hypothesisId: string, data: Record<string, unknown>): void {
  // #region agent log
  fetch('http://localhost:7319/ingest/99c8c27e-61cc-44fe-b95c-d0b4a202837b', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a9c3c9' },
    body: JSON.stringify({
      sessionId: 'a9c3c9',
      runId: 'max-avatar-debug-v1',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

async function sendDeclarationAsCard(
  ctx: AppContext,
  deps: HandlerDeps,
  userId: string,
  structured: DeclarationStructured,
  rawPost: string
): Promise<void> {
  const { handleLlmReply, pool } = deps;
  const timeHHmm = await getUserLocalTimeHHmm(userId, pool);
  const username = ctx.displayName?.trim() || 'Founder';
  const avatarDataUrl = await ctx.getAvatarDataUrl?.();
  const avatarBackgroundImage = avatarDataUrl ? `url(${avatarDataUrl})` : 'none';
  dbg('declaration.ts:sendDeclarationAsCard:1', 'declaration card avatar source', 'H6', {
    channel: ctx.channel,
    hasAvatarDataUrl: Boolean(avatarDataUrl),
    avatarPrefix: avatarDataUrl?.slice(0, 36) ?? '',
  });
  try {
    const png = await renderDeclarationCardPng({
      username,
      main_focus: structured.main_focus,
      win_result: structured.win_result,
      week_failure: structured.week_failure,
      timeHHmm,
      avatarBackgroundImage,
    });
    if (ctx.replyImage) {
      logger.info({ userId, channel: ctx.channel }, 'Declaration card image sent');
      await ctx.replyImage(png, 'declaration.png', '✅ Declaration зафиксирован.');
      return;
    }
    logger.info({ userId, channel: ctx.channel }, 'Declaration card image unsupported in channel, fallback to text');
  } catch (err) {
    logger.error({ err, userId }, 'Declaration card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'declaration');
}

export async function handleDeclarationCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /declaration');
  ensureSession(ctx);
  ctx.session.declarationEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
  const existing = await pool.query(
    'SELECT raw_post FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );

  if (existing.rows.length > 0) {
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
  const weekId = getWeekId(dateStrToWeekRef(userDateStr));
  const row = await pool.query<{
    raw_post: string;
    main_focus: string;
    win_result: string;
    week_failure: string;
  }>(
    'SELECT raw_post, main_focus, win_result, week_failure FROM weekly_declarations WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  const r = row.rows[0];
  await ctx.answerCallbackQuery();
  if (!r?.raw_post?.trim()) {
    await ctx.reply('Declaration пуст.');
    return;
  }
  await sendDeclarationAsCard(
    ctx,
    deps,
    userId,
    { main_focus: r.main_focus, win_result: r.win_result, week_failure: r.week_failure },
    r.raw_post
  );
}

export async function handleDeclarationEdit(ctx: AppContext): Promise<void> {
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
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
    ctx.session!.step = undefined;
    ctx.session!.declarationAnswers = undefined;
    const isEdit = ctx.session!.declarationEditMode ?? false;
    ctx.session!.declarationEditMode = undefined;

    try {
      if (isEdit) {
        const rawPost = await declarationService.updateDeclarationManual(userId, record);
        funnelCompleted.inc({ type: 'declaration' });
        logger.info({ userId }, 'Declaration manually updated');
        await ctx.reply('❗️ Declaration обновлён.');
        await sendDeclarationAsCard(ctx, deps, userId, record, rawPost);
      } else {
        await ctx.reply('🟢 Готовлю declaration...');
        const { rawPost, structured } = await declarationService.createDeclaration(userId, record);
        funnelCompleted.inc({ type: 'declaration' });
        logger.info({ userId }, 'Declaration created');
        await sendDeclarationAsCard(ctx, deps, userId, structured, rawPost);
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
    await handleDeclarationEdit(appCtx);
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
}
