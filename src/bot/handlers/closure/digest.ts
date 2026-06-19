import type { Bot } from 'grammy';
import type { BotContext } from '../../context.js';
import { ensureSession } from '../../context.js';
import { buildAppContext } from '../../transport/telegram-adapter.js';
import { registerGuardedCommand, registerGuardedCallback } from '../../register-guard.js';
import { withProductMode } from '../../with-product-mode.js';
import type { AppContext } from '../../transport/types.js';
import {
  CLOSURE_ONBOARDING_AFTER_DIGEST_1,
  CLOSURE_ONBOARDING_AFTER_DIGEST_QUESTION,
  FLOW_CHOICE_USE_BUTTONS_HINT,
  LLM_PREPARING_DIGEST,
} from '../../closure-conversations.js';
import { logger } from '../../../observability/logger.js';
import { cardEditClicks, funnelCompleted, funnelStarted } from '../../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../../services/week-service.js';
import { renderDigestCardPng } from '../../../services/digest-card-render.js';
import type { HandlerDeps } from '../deps.js';

async function sendDigestAsCard(
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
    const png = await renderDigestCardPng({
      username,
      content: rawPost,
      timeHHmm,
      avatarBackgroundImage,
      rhythmLine,
    });
    if (ctx.replyImage) {
      await ctx.replyImage(png, 'digest.png');
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'Digest card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'digest');
}

export async function handleDigestCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, digestService, replyWithServiceError, countRows } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /digest');
  ensureSession(ctx);
  ctx.session.digestEditMode = false;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const { start, end } = getWeekStartEnd(userDateStr);
  const existing = await pool.query(
    'SELECT raw_post FROM weekly_digests WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );

  if (existing.rows.length > 0) {
    ctx.session.step = 'digest_choice';
    await ctx.reply('Дайджест на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'digest_show' },
        { text: 'Изменить', callback_data: 'digest_edit' },
      ]],
    });
    return;
  }

  const matter = await pool.query(
    'SELECT 1 FROM weekly_matters WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (matter.rows.length === 0) {
    await ctx.reply('Сначала выбери дело недели: /matter');
    return;
  }

  const steps = await pool.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM matter_steps WHERE user_id = $1 AND date >= $2 AND date <= $3',
    [userId, start, end]
  );
  if ((steps.rows[0]?.total ?? 0) === 0) {
    await ctx.reply('Сначала отметь хотя бы один шаг недели. Напиши /step');
    return;
  }

  funnelStarted.inc({ type: 'digest' });
  const wasFirstDigest =
    (await countRows(pool, 'SELECT COUNT(*)::int AS c FROM weekly_digests WHERE user_id = $1', [userId])) === 0;
  try {
    await ctx.reply(LLM_PREPARING_DIGEST);
    const rawPost = await digestService.createDigest(userId);
    funnelCompleted.inc({ type: 'digest' });
    await sendDigestAsCard(ctx, deps, userId, rawPost ?? '');
    if (wasFirstDigest) {
      await ctx.reply(CLOSURE_ONBOARDING_AFTER_DIGEST_1);
      await ctx.reply(CLOSURE_ONBOARDING_AFTER_DIGEST_QUESTION, {
        reply_markup: [[
          { text: 'Да', callback_data: 'onboard_digest_cta_yes' },
          { text: 'Позже', callback_data: 'onboard_digest_cta_later' },
        ]],
      });
      ensureSession(ctx);
      ctx.session.step = 'onboard_digest_cta';
    }
  } catch (err) {
    logger.error({ err, userId }, 'Digest creation failed');
    ctx.alertError?.(err, 'digest', userId);
    await replyWithServiceError(ctx, err, userId, 'digest');
  }
}

export async function handleDigestShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  ctx.session.step = undefined;

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM weekly_digests WHERE user_id = $1 AND week_id = $2',
    [userId, weekId]
  );
  await ctx.answerCallbackQuery();
  const rawPost = row.rows[0]?.raw_post ?? '';
  if (!rawPost.trim()) {
    await ctx.reply('Дайджест пуст.');
    return;
  }
  await sendDigestAsCard(ctx, deps, userId, rawPost);
}

export async function handleNotifyDigest(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  return handleDigestCommand(ctx, deps);
}

export async function handleDigestEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { digestService, replyWithServiceError } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'digest' });
  funnelStarted.inc({ type: 'digest' });
  try {
    await ctx.reply(LLM_PREPARING_DIGEST);
    const rawPost = await digestService.updateDigestManual(userId);
    funnelCompleted.inc({ type: 'digest' });
    await ctx.reply('❗️ Дайджест обновлён.');
    await sendDigestAsCard(ctx, deps, userId, rawPost ?? '');
  } catch (err) {
    logger.error({ err, userId }, 'Digest manual update failed');
    ctx.alertError?.(err, 'digest', userId);
    await replyWithServiceError(ctx, err, userId, 'digest');
  }
}

export function registerDigestHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  registerGuardedCommand(bot, deps, 'closure', 'digest', handleDigestCommand);
  registerGuardedCallback(bot, deps, 'closure', 'digest_show', handleDigestShow);
  registerGuardedCallback(bot, deps, 'closure', 'digest_edit', handleDigestEdit);
  registerGuardedCallback(bot, deps, 'closure', 'notify_digest', handleNotifyDigest);
  bot.on('message:text').filter(
    (ctx) => ctx.session?.step === 'digest_choice' && !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await withProductMode('closure', async (c) => {
        await c.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
      })(appCtx, deps);
    }
  );
}
