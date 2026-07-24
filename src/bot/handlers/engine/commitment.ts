import { ensureSession } from '../../context.js';
import type { AppContext } from '../../transport/types.js';
import type { EngineMode } from '../../../services/product-mode.js';
import type { ModeConfig } from '../../../modes/types.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from '../../../modes/shared.js';
import { logger } from '../../../observability/logger.js';
import { cardEditClicks } from '../../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../../db/user-timezone.js';
import { getWeekId, getWeekStartEnd } from '../../../services/week-service.js';
import { renderEngineCardPng } from '../../../services/engine/card-render.js';
import { getModeConfig } from '../../../modes/registry.js';
import type { HandlerDeps } from '../deps.js';

async function sendFocusCard(
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
      'engine_focus',
      extraHeadings
    );
    if (ctx.replyImage) {
      await ctx.replyImage(png, 'focus.png');
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'Engine focus card PNG failed');
  }
  await handleLlmReply(ctx, rawPost, userId, 'matter');
}

export async function handleFocusCommand(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, mode }, 'Command /focus');
  ensureSession(ctx);
  ctx.session.engineFocusEditMode = false;

  const weekId = getWeekId(await getUserLocalDate(userId, pool));
  const existing = await pool.query(
    'SELECT raw_post FROM engine_commitments WHERE user_id = $1 AND mode = $2 AND week_id = $3',
    [userId, mode, weekId]
  );
  if (existing.rows.length > 0) {
    ctx.session.step = 'engine_focus_choice';
    await ctx.reply('На эту неделю уже есть фокус.', {
      reply_markup: [[
        { text: 'Показать', callback_data: 'engine_focus_show' },
        { text: 'Изменить', callback_data: 'engine_focus_edit' },
      ]],
    });
    return;
  }

  ctx.session.engineFocusAnswers = {};
  ctx.session.step = 'engine_focus_title';
  await ctx.reply(config.commitment.titleQuestion);
}

export async function handleFocusShow(ctx: AppContext, deps: HandlerDeps, mode: EngineMode): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  ctx.session.step = undefined;
  const weekId = getWeekId(await getUserLocalDate(userId, pool));
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM engine_commitments WHERE user_id = $1 AND mode = $2 AND week_id = $3',
    [userId, mode, weekId]
  );
  await ctx.answerCallbackQuery();
  const raw = row.rows[0]?.raw_post ?? '';
  if (!raw.trim()) {
    await ctx.reply('Пусто.');
    return;
  }
  await sendFocusCard(ctx, deps, userId, raw, [getModeConfig(mode).card.commitTitle]);
}

export async function handleFocusEdit(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const { pool, countRows } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'matter' });
  const userDateStr = await getUserLocalDate(userId, pool);
  const { start, end } = getWeekStartEnd(userDateStr);
  const hasLogs = await countRows(
    pool,
    'SELECT COUNT(*)::int AS c FROM engine_steps WHERE user_id = $1 AND mode = $2 AND date >= $3 AND date <= $4',
    [userId, mode, start, end]
  );
  if (hasLogs > 0) {
    await ctx.reply(config.commitment.lockHint);
    return;
  }
  ctx.session.engineFocusEditMode = true;
  ctx.session.engineFocusAnswers = {};
  ctx.session.step = 'engine_focus_title';
  await ctx.reply(config.commitment.titleQuestion);
}

export async function handleFocusMessage(
  ctx: AppContext,
  text: string,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const { engineServices, replyWithServiceError } = deps;
  const userId = ctx.userId;
  const step = ctx.session!.step!;

  if (step === 'engine_focus_choice') {
    if (!text.trim().startsWith('/')) await ctx.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
    return;
  }

  if (step === 'engine_focus_title') {
    ctx.session!.engineFocusAnswers ??= {};
    ctx.session!.engineFocusAnswers.title = text;
    ctx.session!.step = 'engine_focus_0';
    await ctx.reply(config.commitment.followups[0].text);
    return;
  }

  const m = step.match(/^engine_focus_(\d+)$/);
  if (!m) return;
  const idx = parseInt(m[1], 10);
  const q = config.commitment.followups[idx];
  ctx.session!.engineFocusAnswers![q.key] = text;

  if (idx >= config.commitment.followups.length - 1) {
    ctx.session!.step = undefined;
    const answers = { ...ctx.session!.engineFocusAnswers! };
    const title = answers.title ?? '';
    const followupAnswers: Record<string, string> = {};
    for (const fq of config.commitment.followups) followupAnswers[fq.key] = answers[fq.key] ?? '';
    const isEdit = ctx.session!.engineFocusEditMode ?? false;
    ctx.session!.engineFocusAnswers = undefined;
    ctx.session!.engineFocusEditMode = undefined;

    try {
      await ctx.reply(config.commitment.preparingText);
      const rawPost = isEdit
        ? await engineServices.commitment.updateCommitmentManual(userId, mode, {
            title,
            answers: followupAnswers,
          })
        : await engineServices.commitment.createCommitment(userId, mode, {
            title,
            answers: followupAnswers,
          });
      if (isEdit) await ctx.reply('❗️ Обновлено.');
      await sendFocusCard(ctx, deps, userId, rawPost, [config.card.commitTitle]);
      await ctx.reply(config.onboarding.afterFocusHint);
    } catch (err) {
      logger.error({ err, userId, mode }, 'Engine focus failed');
      ctx.alertError?.(err, 'matter', userId);
      await replyWithServiceError(ctx, err, userId, 'matter');
    }
  } else {
    ctx.session!.step = `engine_focus_${idx + 1}`;
    await ctx.reply(config.commitment.followups[idx + 1].text);
  }
}

export async function handleNotifyFocus(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  await handleFocusCommand(ctx, deps, mode, config);
}
