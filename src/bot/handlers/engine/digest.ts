import { ensureSession } from '../../context.js';
import type { AppContext } from '../../transport/types.js';
import type { EngineMode } from '../../../services/product-mode.js';
import type { ModeConfig } from '../../../modes/types.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from '../../../modes/shared.js';
import { logger } from '../../../observability/logger.js';
import { cardEditClicks } from '../../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../../db/user-timezone.js';
import { getWeekId } from '../../../services/week-service.js';
import { renderEngineCardPng } from '../../../services/engine/card-render.js';
import { getModeConfig } from '../../../modes/registry.js';
import type { HandlerDeps } from '../deps.js';

async function sendRecapCard(
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
      'engine_recap',
      extraHeadings
    );
    if (ctx.replyImage) {
      await ctx.replyImage(png, 'recap.png');
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'Engine recap card PNG failed');
  }
  await handleLlmReply(ctx, rawPost, userId, 'digest');
}

async function maybeShowAfterRecapCta(
  ctx: AppContext,
  deps: HandlerDeps,
  config: ModeConfig,
  isFirstRecap: boolean
): Promise<void> {
  if (!isFirstRecap) return;
  const { pool } = deps;
  const userId = ctx.userId;
  const row = await pool.query<{ onboarding_completed_at: Date | null }>(
    'SELECT onboarding_completed_at FROM users WHERE user_id = $1',
    [userId]
  );
  if (row.rows[0]?.onboarding_completed_at != null) return;
  await ctx.reply(config.onboarding.afterRecapQuestion, {
    reply_markup: [[
      { text: 'Да', callback_data: 'onboard_digest_cta_yes' },
      { text: 'Позже', callback_data: 'onboard_digest_cta_later' },
    ]],
  });
}

export async function handleRecapCommand(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, mode }, 'Command /recap');
  ensureSession(ctx);
  ctx.session.step = undefined;

  const weekId = getWeekId(await getUserLocalDate(userId, pool));
  const existing = await pool.query(
    'SELECT raw_post FROM engine_digests WHERE user_id = $1 AND mode = $2 AND week_id = $3',
    [userId, mode, weekId]
  );
  if (existing.rows.length > 0) {
    ctx.session.step = 'engine_recap_choice';
    await ctx.reply('Recap на эту неделю уже есть.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'engine_recap_show' },
        { text: 'Обновить', callback_data: 'engine_recap_edit' },
      ]],
    });
    return;
  }

  const priorDigests = await pool.query(
    'SELECT 1 FROM engine_digests WHERE user_id = $1 AND mode = $2 LIMIT 1',
    [userId, mode]
  );
  const isFirstRecap = priorDigests.rows.length === 0;
  await runRecapGenerate(ctx, deps, mode, config, false, isFirstRecap);
}

async function runRecapGenerate(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig,
  isEdit: boolean,
  isFirstRecap: boolean
): Promise<void> {
  const { engineServices, replyWithServiceError } = deps;
  const userId = ctx.userId;
  try {
    await ctx.reply(config.digest.preparingText);
    const rawPost = isEdit
      ? await engineServices.digest.updateDigestManual(userId, mode)
      : await engineServices.digest.createDigest(userId, mode);
    if (isEdit) await ctx.reply('❗️ Recap обновлён.');
    await sendRecapCard(ctx, deps, userId, rawPost, [config.card.digestTitle]);
    await ctx.reply(config.onboarding.afterRecapHint);
    await maybeShowAfterRecapCta(ctx, deps, config, isFirstRecap);
  } catch (err) {
    logger.error({ err, userId, mode }, 'Engine recap failed');
    ctx.alertError?.(err, 'digest', userId);
    await replyWithServiceError(ctx, err, userId, 'digest');
  }
}

export async function handleRecapShow(ctx: AppContext, deps: HandlerDeps, mode: EngineMode): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  ctx.session!.step = undefined;
  await ctx.answerCallbackQuery();
  const weekId = getWeekId(await getUserLocalDate(userId, pool));
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM engine_digests WHERE user_id = $1 AND mode = $2 AND week_id = $3',
    [userId, mode, weekId]
  );
  const raw = row.rows[0]?.raw_post ?? '';
  if (!raw.trim()) {
    await ctx.reply('Пусто.');
    return;
  }
  await sendRecapCard(ctx, deps, userId, raw, [getModeConfig(mode).card.digestTitle]);
}

export async function handleRecapEdit(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'digest' });
  await runRecapGenerate(ctx, deps, mode, config, true, false);
}

export async function handleRecapChoiceMessage(ctx: AppContext, text: string): Promise<void> {
  if (ctx.session?.step === 'engine_recap_choice' && !text.trim().startsWith('/')) {
    await ctx.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
  }
}

export async function handleNotifyRecap(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  await handleRecapCommand(ctx, deps, mode, config);
}
