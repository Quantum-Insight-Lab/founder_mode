import type { Bot } from 'grammy';
import type { BotContext } from '../../context.js';
import { ensureSession } from '../../context.js';
import { buildAppContext } from '../../transport/telegram-adapter.js';
import { registerGuardedCommand, registerGuardedCallback } from '../../register-guard.js';
import { withProductMode } from '../../with-product-mode.js';
import type { AppContext } from '../../transport/types.js';
import {
  CLOSURE_ONBOARDING_AFTER_STEP,
  CLOSURE_ONBOARDING_AFTER_STEP_HINT,
  CLOSURE_ONBOARDING_FIRST_STEP_INTRO,
  CLOSURE_ONBOARDING_NEXT_STEP_INTRO,
  FLOW_CHOICE_USE_BUTTONS_HINT,
  LLM_PREPARING_STEP,
  STEP_DATE_QUESTION,
  STEP_MOVEMENT_QUESTION,
  STEP_QUESTIONS_NO,
  STEP_QUESTIONS_PARTIAL,
  STEP_QUESTIONS_YES,
  STEP_SKIP_HINT,
} from '../../closure-conversations.js';
import { logger } from '../../../observability/logger.js';
import { cardEditClicks, funnelCompleted, funnelStarted } from '../../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../../db/user-timezone.js';
import { instantToUserLocalDateString, parseTimezoneOffset } from '../../../domain/timezone.js';
import { getWeekId } from '../../../services/week-service.js';
import { renderStepCardPng } from '../../../services/step-card-render.js';
import type { HandlerDeps } from '../deps.js';

const MOVEMENT_MARKUP: import('../../transport/types.js').InlineButton[][] = [
  [
    { text: 'Да', callback_data: 'step_yes' },
    { text: 'Нет', callback_data: 'step_no' },
    { text: 'Частично', callback_data: 'step_partial' },
  ],
];

async function sendStepAsCard(
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
    const png = await renderStepCardPng({
      username,
      content: rawPost,
      timeHHmm,
      avatarBackgroundImage,
      rhythmLine,
    });
    if (ctx.replyImage) {
      await ctx.replyImage(png, 'step.png');
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'Step card PNG failed, falling back to text');
  }
  await handleLlmReply(ctx, rawPost, userId, 'step');
}

async function proceedWithStepDate(ctx: AppContext, date: string, userId: string, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  ensureSession(ctx);
  ctx.session.stepData = { date };

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const matter = await pool.query(
    'SELECT 1 FROM weekly_matters WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (matter.rows.length === 0) {
    ctx.session.step = undefined;
    await ctx.reply('Сначала выбери дело недели: /matter');
    return;
  }

  const existing = await pool.query('SELECT 1 FROM matter_steps WHERE user_id = $1 AND date = $2', [userId, date]);
  if (existing.rows.length > 0) {
    ctx.session.step = 'step_choice';
    await ctx.reply(`Шаг за ${date} уже есть.`, {
      reply_markup: [[
        { text: 'Показать', callback_data: 'step_show' },
        { text: 'Изменить', callback_data: 'step_edit' },
      ]],
    });
    return;
  }

  ctx.session.step = 'step_movement';
  ctx.session.stepEditMode = false;

  const meta = await pool.query<{ total: number; digest_count: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM matter_steps WHERE user_id = $1) AS total,
       (SELECT COUNT(*)::int FROM weekly_digests WHERE user_id = $1) AS digest_count`,
    [userId]
  );
  const totalSteps = meta.rows[0]?.total ?? 0;
  const digestCount = meta.rows[0]?.digest_count ?? 0;
  if (digestCount === 0) {
    await ctx.reply(totalSteps === 0 ? CLOSURE_ONBOARDING_FIRST_STEP_INTRO : CLOSURE_ONBOARDING_NEXT_STEP_INTRO);
  }
  await ctx.reply(STEP_MOVEMENT_QUESTION, { reply_markup: MOVEMENT_MARKUP });
}

export async function handleStepCommandBase(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, getFixationDate } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  ctx.session.stepData = {};
  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const matter = await pool.query(
    'SELECT 1 FROM weekly_matters WHERE user_id = $1 AND week_id = $2 LIMIT 1',
    [userId, weekId]
  );
  if (matter.rows.length === 0) {
    ctx.session.step = undefined;
    await ctx.reply('Сначала выбери дело недели: /matter');
    return;
  }

  const yesterday = await getFixationDate(userId, 'yesterday');
  const today = await getFixationDate(userId, 'today');

  const stepMeta = await pool.query<{
    total: number;
    has_yesterday: boolean;
    has_today: boolean;
    matter_created_at: string | null;
    notifications_enabled: boolean;
    skip_hint_shown_at: string | null;
    timezone: string | null;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM matter_steps WHERE user_id = $1) AS total,
       EXISTS(SELECT 1 FROM matter_steps WHERE user_id = $1 AND date = $2) AS has_yesterday,
       EXISTS(SELECT 1 FROM matter_steps WHERE user_id = $1 AND date = $3) AS has_today,
       (SELECT wm.created_at FROM weekly_matters wm WHERE wm.user_id = $1 AND wm.week_id = $4) AS matter_created_at,
       COALESCE(s.notifications_enabled, false) AS notifications_enabled,
       s.skip_hint_shown_at,
       s.timezone
     FROM (SELECT $1::uuid AS uid) u
     LEFT JOIN user_settings s ON s.user_id = u.uid`,
    [userId, yesterday, today, weekId]
  );
  const r = stepMeta.rows[0];
  const offsetMin = r?.timezone ? parseTimezoneOffset(r.timezone) : null;
  const matterAt = r?.matter_created_at ? new Date(r.matter_created_at) : null;
  const matterLocalDate = matterAt ? instantToUserLocalDateString(matterAt, offsetMin) : null;
  const matter_created_today = matterLocalDate === today;
  const skipDateQuestion = r?.has_yesterday || r?.has_today || matter_created_today;

  if (skipDateQuestion) {
    await proceedWithStepDate(ctx, today, userId, deps);
    return;
  }

  const showSkipHint = !r?.notifications_enabled && r?.skip_hint_shown_at == null;
  if (showSkipHint) {
    await ctx.reply(`<i>${STEP_SKIP_HINT}</i>`, { parse_mode: 'HTML' });
  }
  const rows: import('../../transport/types.js').InlineButton[][] = [
    [
      { text: 'Вчера', callback_data: 'step_date_yesterday' },
      { text: 'Сегодня', callback_data: 'step_date_today' },
    ],
  ];
  if (showSkipHint) {
    rows.push([{ text: 'Включить напоминания', callback_data: 'step_skip_enable_notif' }]);
  }

  ctx.session.step = 'step_date';
  await ctx.reply(STEP_DATE_QUESTION, { reply_markup: rows });
}

export async function handleStepCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /step');
  ensureSession(ctx);
  funnelStarted.inc({ type: 'step' });
  await handleStepCommandBase(ctx, deps);
}

export async function handleStepSkipEnableNotif(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { settingsService, showSettingsMenu } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await settingsService.updateSkipHintShownAt(userId);
  await showSettingsMenu(ctx, userId);
}

export async function handleStepDateChoice(
  ctx: AppContext,
  choice: 'yesterday' | 'today',
  deps: HandlerDeps
): Promise<void> {
  const { getFixationDate } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  const selectedDate = await getFixationDate(userId, choice);
  await proceedWithStepDate(ctx, selectedDate, userId, deps);
}

export async function handleStepShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  const date = ctx.session.stepData?.date;
  ctx.session.step = undefined;
  ctx.session.stepData = undefined;
  if (!date) {
    await ctx.answerCallbackQuery();
    await ctx.reply('❌ Дата не выбрана.');
    return;
  }
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM matter_steps WHERE user_id = $1 AND date = $2',
    [userId, date]
  );
  await ctx.answerCallbackQuery();
  const rawPost = row.rows[0]?.raw_post ?? '';
  if (!rawPost.trim()) {
    await ctx.reply('Шаг пуст.');
    return;
  }
  await sendStepAsCard(ctx, deps, userId, rawPost);
}

export async function handleStepEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = 'step_movement';
  ctx.session.stepEditMode = true;
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'step' });
  await ctx.reply(STEP_MOVEMENT_QUESTION, { reply_markup: MOVEMENT_MARKUP });
}

export async function handleStepEditConfirmNo(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.stepData = undefined;
  await ctx.answerCallbackQuery();
  await ctx.reply('👌 Отменено.');
}

export async function handleStepNo(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.stepData ??= {};
  ctx.session.stepData.had_movement = false;
  ctx.session.stepData.movement_branch = 'no';
  ctx.session.step = 'step_nomovement_0';
  await ctx.answerCallbackQuery();
  await ctx.reply(STEP_QUESTIONS_NO[0].text);
}

export async function handleStepPartial(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.stepData ??= {};
  ctx.session.stepData.had_movement = false;
  ctx.session.stepData.movement_branch = 'partial';
  ctx.session.step = 'step_partial_0';
  await ctx.answerCallbackQuery();
  await ctx.reply(STEP_QUESTIONS_PARTIAL[0].text);
}

export async function handleStepYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.stepData ??= {};
  ctx.session.stepData.had_movement = true;
  ctx.session.stepData.movement_branch = 'yes';
  ctx.session.step = 'step_movement_0';
  await ctx.answerCallbackQuery();
  await ctx.reply(STEP_QUESTIONS_YES[0].text);
}

const stepStepRe = /^step_(movement|nomovement|partial)_(\d+)$/;
const branchToQuestions = {
  movement: STEP_QUESTIONS_YES,
  nomovement: STEP_QUESTIONS_NO,
  partial: STEP_QUESTIONS_PARTIAL,
} as const;

export async function handleStepMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { pool, stepService, replyWithServiceError } = deps;
  const userId = ctx.userId;
  const m = ctx.session!.step!.match(stepStepRe)!;
  const branch = m[1] as keyof typeof branchToQuestions;
  const idx = parseInt(m[2], 10);
  const questions = branchToQuestions[branch];
  const { key } = questions[idx];

  ctx.session!.stepData ??= {};
  ctx.session!.stepData![key] = text;

  if (idx >= questions.length - 1) {
    ctx.session!.step = undefined;
    const data = ctx.session!.stepData!;
    const isEdit = ctx.session!.stepEditMode ?? false;
    const movementBranch = (data.movement_branch ?? (data.had_movement ? 'yes' : 'no')) as 'yes' | 'no' | 'partial';
    ctx.session!.stepData = undefined;
    ctx.session!.stepEditMode = undefined;

    const payload = {
      date: data.date!,
      movement_branch: movementBranch,
      had_movement: movementBranch === 'yes',
      what_moved: data.what_moved as string | undefined,
      tomorrow_step: data.tomorrow_step as string | undefined,
      what_stopped: data.what_stopped as string | undefined,
      avoidance: data.avoidance as string | undefined,
      why_partial: data.why_partial as string | undefined,
    };

    try {
      await ctx.reply(LLM_PREPARING_STEP);
      if (isEdit) {
        const rawPost = await stepService.updateStepManual(userId, payload);
        funnelCompleted.inc({ type: 'step' });
        await ctx.reply('❗️ Шаг обновлён.');
        await sendStepAsCard(ctx, deps, userId, rawPost ?? '');
      } else {
        const rawPost = await stepService.submitStep(userId, payload);
        funnelCompleted.inc({ type: 'step' });
        await sendStepAsCard(ctx, deps, userId, rawPost ?? '');
        const digestMeta = await pool.query<{ digest_count: number }>(
          'SELECT COUNT(*)::int AS digest_count FROM weekly_digests WHERE user_id = $1',
          [userId]
        );
        if ((digestMeta.rows[0]?.digest_count ?? 0) === 0) {
          await ctx.reply(CLOSURE_ONBOARDING_AFTER_STEP);
          const hintRow = await pool.query<{ fixation_onboarding_hint_shown_at: Date | null }>(
            'SELECT fixation_onboarding_hint_shown_at FROM user_settings WHERE user_id = $1',
            [userId]
          );
          if (hintRow.rows[0]?.fixation_onboarding_hint_shown_at == null) {
            await ctx.reply(`<i>${CLOSURE_ONBOARDING_AFTER_STEP_HINT}</i>`, { parse_mode: 'HTML' });
            await pool.query(
              `INSERT INTO user_settings (user_id, fixation_onboarding_hint_shown_at) VALUES ($1, NOW())
               ON CONFLICT (user_id) DO UPDATE SET fixation_onboarding_hint_shown_at = NOW(), updated_at = NOW()`,
              [userId]
            );
          }
        }
      }
    } catch (err) {
      logger.error({ err, userId }, isEdit ? 'Step manual update failed' : 'Step submission failed');
      ctx.alertError?.(err, 'step', userId);
      await replyWithServiceError(ctx, err, userId, 'step');
    }
  } else {
    ctx.session!.step = `step_${branch}_${idx + 1}`;
    await ctx.reply(questions[idx + 1].text);
  }
}

export async function handleNotifyStep(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  await handleStepCommandBase(ctx, deps);
}

export function registerStepHandlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  registerGuardedCommand(bot, deps, 'closure', 'step', handleStepCommand);
  const closureCallbacks: Array<[string, (ctx: AppContext, deps: HandlerDeps) => Promise<void>]> = [
    ['step_skip_enable_notif', handleStepSkipEnableNotif],
    ['step_show', handleStepShow],
    ['step_edit', handleStepEdit],
    ['step_edit_confirm_no', handleStepEditConfirmNo],
    ['step_no', handleStepNo],
    ['step_partial', handleStepPartial],
    ['step_yes', handleStepYes],
    ['notify_step', handleNotifyStep],
  ];
  for (const [data, handler] of closureCallbacks) {
    registerGuardedCallback(bot, deps, 'closure', data, handler);
  }
  bot.callbackQuery('step_date_yesterday', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await withProductMode('closure', (c, d) => handleStepDateChoice(c, 'yesterday', d))(appCtx, deps);
  });
  bot.callbackQuery('step_date_today', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await withProductMode('closure', (c, d) => handleStepDateChoice(c, 'today', d))(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) => {
      const m = ctx.session?.step?.match(stepStepRe);
      return !!m && !ctx.message.text?.trim().startsWith('/');
    },
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await withProductMode('closure', (c, d) => handleStepMessage(c, ctx.message.text ?? '', d))(appCtx, deps);
    }
  );
  bot.on('message:text').filter(
    (ctx) => ctx.session?.step === 'step_choice' && !ctx.message.text?.trim().startsWith('/'),
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await withProductMode('closure', async (c) => {
        await c.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
      })(appCtx, deps);
    }
  );
}
