import { ensureSession } from '../../context.js';
import type { AppContext } from '../../transport/types.js';
import type { EngineMode } from '../../../services/product-mode.js';
import type { ModeConfig } from '../../../modes/types.js';
import { logger } from '../../../observability/logger.js';
import { getUserLocalTimeHHmm } from '../../../db/user-timezone.js';
import { renderEngineCardPng } from '../../../services/engine/card-render.js';
import type { HandlerDeps } from '../deps.js';

async function sendPivotCard(
  ctx: AppContext,
  deps: HandlerDeps,
  userId: string,
  rawPost: string,
  extraHeadings: string[]
): Promise<void> {
  const { handleLlmReply, pool, resolveAvatarBackgroundImage, getRhythmLineForCard } = deps;
  const timeHHmm = await getUserLocalTimeHHmm(userId, pool);
  const username = ctx.displayName?.trim() || 'User';
  const avatarBackgroundImage = await resolveAvatarBackgroundImage(ctx, userId);
  const rhythmLine = (await getRhythmLineForCard(userId)) ?? undefined;
  try {
    const png = await renderEngineCardPng(
      { username, content: rawPost, timeHHmm, avatarBackgroundImage, rhythmLine },
      'engine_pivot',
      extraHeadings
    );
    if (ctx.replyImage) {
      await ctx.replyImage(png, 'pivot.png');
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'Engine pivot card PNG failed');
  }
  await handleLlmReply(ctx, rawPost, userId, 'switch');
}

export async function handlePivotCommand(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  logger.info({ channel: ctx.channel, mode }, 'Command /pivot');
  ensureSession(ctx);
  ctx.session.enginePivotAnswers = {};
  ctx.session.step = 'engine_pivot_0';
  await ctx.reply(config.switchFlow.questions[0].text);
}

export async function handlePivotMessage(
  ctx: AppContext,
  text: string,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const { engineServices, replyWithServiceError } = deps;
  const userId = ctx.userId;
  const m = ctx.session!.step?.match(/^engine_pivot_(\d+)$/);
  if (!m) return;
  const idx = parseInt(m[1], 10);
  const q = config.switchFlow.questions[idx];
  ctx.session!.enginePivotAnswers ??= {};
  ctx.session!.enginePivotAnswers[q.key] = text;

  if (idx >= config.switchFlow.questions.length - 1) {
    ctx.session!.step = undefined;
    const answers = { ...ctx.session!.enginePivotAnswers! };
    ctx.session!.enginePivotAnswers = undefined;
    try {
      await ctx.reply(config.switchFlow.preparingText);
      const rawPost = await engineServices.switch.createSwitch(userId, mode, answers);
      await sendPivotCard(ctx, deps, userId, rawPost, [config.card.switchTitle]);
    } catch (err) {
      logger.error({ err, userId, mode }, 'Engine pivot failed');
      ctx.alertError?.(err, 'switch', userId);
      await replyWithServiceError(ctx, err, userId, 'switch');
    }
  } else {
    ctx.session!.step = `engine_pivot_${idx + 1}`;
    await ctx.reply(config.switchFlow.questions[idx + 1].text);
  }
}
