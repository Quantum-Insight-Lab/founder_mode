import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  REFLECTION_DATE_QUESTION,
  REFLECTION_SKIP_HINT,
  REFLECTION_MOVEMENT_QUESTION,
  REFLECTION_QUESTIONS_MOVEMENT,
  REFLECTION_QUESTIONS_NO_MOVEMENT,
  REFLECTION_QUESTIONS_PARTIAL,
  ONBOARDING_FIRST_REFLECT_INTRO,
  ONBOARDING_NEXT_REFLECT_INTRO,
  ONBOARDING_AFTER_REFLECT,
  ONBOARDING_AFTER_REFLECT_HINT,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { cardEditClicks, funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../db/user-timezone.js';
import { instantToUserLocalDateString, parseTimezoneOffset } from '../../domain/timezone.js';
import { getWeekId } from '../../services/week-service.js';
import { renderFixationCardPng } from '../../services/fixation-card-render.js';
import type { HandlerDeps } from './deps.js';

const MOVEMENT_MARKUP: import('../transport/types.js').InlineButton[][] = [
  [
    { text: 'Да', callback_data: 'fixation_yes' },
    { text: 'Нет', callback_data: 'fixation_no' },
    { text: 'Частично', callback_data: 'fixation_partial' },
  ],
];

async function sendFixationAsCard(
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
    const png = await renderFixationCardPng({
      username,
      content: rawPost,
      timeHHmm,
      avatarBackgroundImage,
      rhythmLine,
    });
    if (ctx.replyImage) {
      logger.info({ userId, channel: ctx.channel }, 'Fixation card image sent');
      await ctx.replyImage(png, 'fixation.png');
      return;
    }
    logger.info({ userId, channel: ctx.channel }, 'Fixation card image unsupported in channel, fallback to text');
  } catch (err) {
    logger.error({ err, userId }, 'Fixation card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'fixation');
}

async function proceedWithFixationDate(ctx: AppContext, date: string, userId: string, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  ensureSession(ctx);
  ctx.session.fixationData = { date };

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const declaration = await pool.query(
    'SELECT 1 FROM weekly_declarations WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (declaration.rows.length === 0) {
    ctx.session.step = undefined;
    await ctx.reply('Сначала нужно зафиксировать declaration недели. Напиши (нажми) /declaration');
    return;
  }

  const existing = await pool.query(
    'SELECT 1 FROM daily_fixations WHERE user_id = $1 AND date = $2',
    [userId, date]
  );

  if (existing.rows.length > 0) {
    ctx.session.step = 'fixation_choice';
    await ctx.reply(`Фиксация за ${date} уже есть.`, {
      reply_markup: [[
        { text: 'Показать', callback_data: 'fixation_show' },
        { text: 'Изменить', callback_data: 'fixation_edit' },
      ]],
    });
    return;
  }

  ctx.session.step = 'fixation_movement';
  ctx.session.fixationEditMode = false;

  const meta = await pool.query<{ total: number; report_count: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM daily_fixations WHERE user_id = $1) AS total,
       (SELECT COUNT(*)::int FROM weekly_reports WHERE user_id = $1) AS report_count`,
    [userId]
  );
  const totalFixations = meta.rows[0]?.total ?? 0;
  const reportCount = meta.rows[0]?.report_count ?? 0;
  if (reportCount === 0) {
    if (totalFixations === 0) {
      await ctx.reply(ONBOARDING_FIRST_REFLECT_INTRO);
    } else {
      await ctx.reply(ONBOARDING_NEXT_REFLECT_INTRO);
    }
  }
  await ctx.reply(REFLECTION_MOVEMENT_QUESTION, {
    reply_markup: MOVEMENT_MARKUP,
  });
}

export async function handleFixationCommandBase(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, getFixationDate } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  ctx.session.fixationData = {};
  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const declaration = await pool.query(
    'SELECT 1 FROM weekly_declarations WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (declaration.rows.length === 0) {
    ctx.session.step = undefined;
    await ctx.reply('Сначала нужно зафиксировать declaration недели. Напиши (нажми) /declaration');
    return;
  }

  const yesterday = await getFixationDate(userId, 'yesterday');
  const today = await getFixationDate(userId, 'today');

  const fixationMeta = await pool.query<{
    total: number;
    has_yesterday: boolean;
    has_today: boolean;
    declaration_created_at: string | null;
    notifications_enabled: boolean;
    skip_hint_shown_at: string | null;
    timezone: string | null;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM daily_fixations WHERE user_id = $1) AS total,
       EXISTS(SELECT 1 FROM daily_fixations WHERE user_id = $1 AND date = $2) AS has_yesterday,
       EXISTS(SELECT 1 FROM daily_fixations WHERE user_id = $1 AND date = $3) AS has_today,
       (SELECT wd.created_at FROM weekly_declarations wd WHERE wd.user_id = $1 AND wd.week_id = $4) AS declaration_created_at,
       COALESCE(s.notifications_enabled, false) AS notifications_enabled,
       s.skip_hint_shown_at,
       s.timezone
     FROM (SELECT $1::uuid AS uid) u
     LEFT JOIN user_settings s ON s.user_id = u.uid`,
    [userId, yesterday, today, weekId]
  );
  const r = fixationMeta.rows[0];
  const offsetMin = r?.timezone ? parseTimezoneOffset(r.timezone) : null;
  const declAt = r?.declaration_created_at ? new Date(r.declaration_created_at) : null;
  const declarationLocalDate = declAt ? instantToUserLocalDateString(declAt, offsetMin) : null;
  const declaration_created_today = declarationLocalDate === today;
  // Вопрос "Вчера/Сегодня" показываем только если:
  // 1) за вчера/сегодня еще нет фиксаций
  // 2) declaration не была создана сегодня (по календарю пользователя, как getUserLocalDate).
  // Если declaration и fixation в один день, сразу идем на today.
  const skipDateQuestion = r?.has_yesterday || r?.has_today || declaration_created_today;

  if (skipDateQuestion) {
    await proceedWithFixationDate(ctx, today, userId, deps);
    return;
  }

  const s = r;
  const showSkipHint = !s?.notifications_enabled && s?.skip_hint_shown_at == null;
  if (showSkipHint) {
    await ctx.reply(REFLECTION_SKIP_HINT);
  }
  const questionText = REFLECTION_DATE_QUESTION;
  const rows: import('../transport/types.js').InlineButton[][] = [
    [
      { text: 'Вчера', callback_data: 'fixation_date_yesterday' },
      { text: 'Сегодня', callback_data: 'fixation_date_today' },
    ],
  ];
  if (showSkipHint) {
    rows.push([{ text: 'Включить уведомления', callback_data: 'fixation_skip_enable_notif' }]);
  }

  ctx.session.step = 'fixation_date';
  await ctx.reply(questionText, { reply_markup: rows });
}

export async function handleFixationCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /fixation');
  ensureSession(ctx);
  funnelStarted.inc({ type: 'fixation' });
  await handleFixationCommandBase(ctx, deps);
}

export async function handleFixationSkipEnableNotif(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { settingsService, showSettingsMenu } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Fixation: skip hint, enable notif');
  await ctx.answerCallbackQuery();
  await settingsService.updateSkipHintShownAt(userId);
  await showSettingsMenu(ctx, userId);
}

export async function handleFixationDateChoice(ctx: AppContext, choice: 'yesterday' | 'today', deps: HandlerDeps): Promise<void> {
  const { getFixationDate } = deps;
  const userId = ctx.userId;
  logger.debug({ userId, choice }, 'Fixation date choice');
  await ctx.answerCallbackQuery();
  const selectedDate = await getFixationDate(userId, choice);
  await proceedWithFixationDate(ctx, selectedDate, userId, deps);
}

export async function handleFixationShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Fixation show');
  ensureSession(ctx);
  const date = ctx.session.fixationData?.date;
  ctx.session.step = undefined;
  ctx.session.fixationData = undefined;
  if (!date) {
    await ctx.answerCallbackQuery();
    await ctx.reply('❌ Дата не выбрана.');
    return;
  }
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM daily_fixations WHERE user_id = $1 AND date = $2',
    [userId, date]
  );
  const rawPost = row.rows[0]?.raw_post ?? '';
  await ctx.answerCallbackQuery();
  if (!rawPost.trim()) {
    await ctx.reply('Фиксация пуста.');
    return;
  }
  await sendFixationAsCard(ctx, deps, userId, rawPost);
}

export async function handleFixationEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = 'fixation_movement';
  ctx.session.fixationEditMode = true;
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'fixation' });
  await ctx.reply(REFLECTION_MOVEMENT_QUESTION, {
    reply_markup: MOVEMENT_MARKUP,
  });
}

export async function handleFixationEditConfirmYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  return handleFixationEdit(ctx, deps);
}

export async function handleFixationEditConfirmNo(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.fixationData = undefined;
  await ctx.answerCallbackQuery();
  logger.debug({ userId: ctx.userId }, 'Fixation edit cancelled');
  await ctx.reply('👌 Отменено.');
}

export async function handleFixationNo(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.fixationData ??= {};
  ctx.session.fixationData.had_movement = false;
  ctx.session.fixationData.movement_branch = 'no';
  ctx.session.step = 'fixation_nomovement_0';
  await ctx.answerCallbackQuery();
  await ctx.reply(REFLECTION_QUESTIONS_NO_MOVEMENT[0].text);
}

export async function handleFixationPartial(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.fixationData ??= {};
  ctx.session.fixationData.had_movement = false;
  ctx.session.fixationData.movement_branch = 'partial';
  ctx.session.step = 'fixation_partial_0';
  await ctx.answerCallbackQuery();
  await ctx.reply(REFLECTION_QUESTIONS_PARTIAL[0].text);
}

export async function handleFixationYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.fixationData ??= {};
  ctx.session.fixationData.had_movement = true;
  ctx.session.fixationData.movement_branch = 'yes';
  ctx.session.step = 'fixation_movement_0';
  await ctx.answerCallbackQuery();
  await ctx.reply(REFLECTION_QUESTIONS_MOVEMENT[0].text);
}

const fixationStepRe = /^fixation_(movement|nomovement|partial)_(\d+)$/;
const branchToQuestions = {
  movement: REFLECTION_QUESTIONS_MOVEMENT,
  nomovement: REFLECTION_QUESTIONS_NO_MOVEMENT,
  partial: REFLECTION_QUESTIONS_PARTIAL,
} as const;

export async function handleFixationMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { pool, fixationService, formatErrorForUser } = deps;
  const userId = ctx.userId;
  const m = ctx.session!.step!.match(fixationStepRe)!;
  const branch = m[1] as keyof typeof branchToQuestions;
  const idx = parseInt(m[2], 10);
  const questions = branchToQuestions[branch];
  const { key } = questions[idx];

  ctx.session!.fixationData ??= {};
  ctx.session!.fixationData![key] = text;

  if (idx >= questions.length - 1) {
    ctx.session!.step = undefined;
    const data = ctx.session!.fixationData!;
    const isEdit = ctx.session!.fixationEditMode ?? false;
    const movementBranch = (data.movement_branch ?? (data.had_movement ? 'yes' : 'no')) as 'yes' | 'no' | 'partial' | 'week_closed';
    ctx.session!.fixationData = undefined;
    ctx.session!.fixationEditMode = undefined;

    const payload = {
      date: data.date!,
      movement_branch: movementBranch,
      had_movement: movementBranch === 'yes',
      what_moved: data.what_moved as string | undefined,
      tomorrow_step: data.tomorrow_step as string | undefined,
      what_stopped: data.what_stopped as string | undefined,
      attention_sink: data.attention_sink as string | undefined,
      why_partial: data.why_partial as string | undefined,
    };

    try {
      if (isEdit) {
        const rawPost = await fixationService.updateFixationManual(userId, payload);
        funnelCompleted.inc({ type: 'fixation' });
        logger.info({ userId, date: data.date }, 'Fixation manually updated');
        await ctx.reply('❗️ Фиксация обновлена.');
        await sendFixationAsCard(ctx, deps, userId, rawPost ?? '');
      } else {
        const rawPost = await fixationService.submitFixation(userId, payload);
        funnelCompleted.inc({ type: 'fixation' });
        logger.info({ userId, date: data.date }, 'Fixation submitted');
        await sendFixationAsCard(ctx, deps, userId, rawPost ?? '');
        const reportMeta = await pool.query<{ report_count: number }>(
          'SELECT COUNT(*)::int AS report_count FROM weekly_reports WHERE user_id = $1',
          [userId]
        );
        const reportCount = reportMeta.rows[0]?.report_count ?? 0;
        if (reportCount === 0) {
          await ctx.reply(ONBOARDING_AFTER_REFLECT);
          const hintRow = await pool.query<{ fixation_onboarding_hint_shown_at: Date | null }>(
            'SELECT fixation_onboarding_hint_shown_at FROM user_settings WHERE user_id = $1',
            [userId]
          );
          if (hintRow.rows[0]?.fixation_onboarding_hint_shown_at == null) {
            await ctx.reply(`<i>${ONBOARDING_AFTER_REFLECT_HINT}</i>`, { parse_mode: 'HTML' });
            await pool.query(
              `INSERT INTO user_settings (user_id, fixation_onboarding_hint_shown_at) VALUES ($1, NOW())
               ON CONFLICT (user_id) DO UPDATE SET fixation_onboarding_hint_shown_at = NOW(), updated_at = NOW()`,
              [userId]
            );
          }
        }
      }
    } catch (err) {
      logger.error({ err, userId }, isEdit ? 'Fixation manual update failed' : 'Fixation submission failed');
      ctx.alertError?.(err, 'fixation', userId);
      await ctx.reply(formatErrorForUser(err));
    }
  } else {
    ctx.session!.step = `fixation_${branch}_${idx + 1}`;
    await ctx.reply(questions[idx + 1].text);
  }
}

export async function handleNotifyFixation(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId }, 'Notify fixation');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  await handleFixationCommandBase(ctx, deps);
}

export function registerFixationHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('fixation', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationCommand(appCtx, deps);
  });
  bot.callbackQuery('fixation_skip_enable_notif', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationSkipEnableNotif(appCtx, deps);
  });
  bot.callbackQuery('fixation_date_yesterday', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationDateChoice(appCtx, 'yesterday', deps);
  });
  bot.callbackQuery('fixation_date_today', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationDateChoice(appCtx, 'today', deps);
  });
  bot.callbackQuery('fixation_show', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationShow(appCtx, deps);
  });
  bot.callbackQuery('fixation_edit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationEdit(appCtx, deps);
  });
  bot.callbackQuery('fixation_edit_confirm_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationEditConfirmYes(appCtx, deps);
  });
  bot.callbackQuery('fixation_edit_confirm_no', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationEditConfirmNo(appCtx, deps);
  });
  bot.callbackQuery('fixation_no', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationNo(appCtx, deps);
  });
  bot.callbackQuery('fixation_partial', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationPartial(appCtx, deps);
  });
  bot.callbackQuery('fixation_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleFixationYes(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) => {
      const m = ctx.session?.step?.match(fixationStepRe);
      return !!m && !ctx.message.text?.trim().startsWith('/');
    },
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleFixationMessage(appCtx, ctx.message.text ?? '', deps);
    }
  );
  bot.callbackQuery('notify_fixation', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleNotifyFixation(appCtx, deps);
  });
}
