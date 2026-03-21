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
  REFLECTION_QUESTIONS_WEEK_CLOSED,
  ONBOARDING_FIRST_REFLECT_INTRO,
  ONBOARDING_NEXT_REFLECT_INTRO,
  ONBOARDING_AFTER_REFLECT,
  ONBOARDING_AFTER_REFLECT_HINT,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { formatLlmResponse } from '../../domain/html.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { dateStrToWeekRef } from '../../domain/timezone.js';
import { getWeekId } from '../../services/plan-service.js';
import type { HandlerDeps } from './deps.js';

const MOVEMENT_MARKUP: import('../transport/types.js').InlineButton[][] = [
  [
    { text: 'Да', callback_data: 'reflect_yes' },
    { text: 'Нет', callback_data: 'reflect_no' },
    { text: 'Частично', callback_data: 'reflect_partial' },
  ],
  [{ text: 'Результат недели уже закрыт', callback_data: 'reflect_week_closed' }],
];

async function proceedWithReflectionDate(ctx: AppContext, date: string, userId: string, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  ensureSession(ctx);
  ctx.session.reflectionData = { date };

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekRef = dateStrToWeekRef(userDateStr);
  const weekId = getWeekId(weekRef);
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
    'SELECT 1 FROM daily_reflections WHERE user_id = $1 AND date = $2',
    [userId, date]
  );

  if (existing.rows.length > 0) {
    ctx.session.step = 'reflect_choice';
    await ctx.reply(`Рефлексия за ${date} уже есть.`, {
      reply_markup: [[
        { text: 'Показать', callback_data: 'reflect_show' },
        { text: 'Изменить', callback_data: 'reflect_edit' },
      ]],
    });
    return;
  }

  ctx.session.step = 'reflect_movement';
  ctx.session.reflectionEditMode = false;

  const meta = await pool.query<{ total: number; review_count: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM daily_reflections WHERE user_id = $1) AS total,
       (SELECT COUNT(*)::int FROM weekly_reviews WHERE user_id = $1) AS review_count`,
    [userId]
  );
  const totalReflections = meta.rows[0]?.total ?? 0;
  const reviewCount = meta.rows[0]?.review_count ?? 0;
  if (totalReflections === 0) {
    await ctx.reply(ONBOARDING_FIRST_REFLECT_INTRO);
  } else if (reviewCount === 0) {
    await ctx.reply(ONBOARDING_NEXT_REFLECT_INTRO);
  }
  await ctx.reply(REFLECTION_MOVEMENT_QUESTION, {
    reply_markup: MOVEMENT_MARKUP,
  });
}

export async function handleReflectCommand(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool, getReflectDate } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /reflect');
  ensureSession(ctx);
  ctx.session.reflectionPromptVariant ??= 'v1';
  ctx.session.reflectionData = {};

  const yesterday = await getReflectDate(userId, 'yesterday');
  const today = await getReflectDate(userId, 'today');

  const reflectMeta = await pool.query<{
    total: number;
    has_yesterday: boolean;
    has_today: boolean;
    notifications_enabled: boolean;
    skip_hint_shown_at: string | null;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM daily_reflections WHERE user_id = $1) AS total,
       EXISTS(SELECT 1 FROM daily_reflections WHERE user_id = $1 AND date = $2) AS has_yesterday,
       EXISTS(SELECT 1 FROM daily_reflections WHERE user_id = $1 AND date = $3) AS has_today,
       COALESCE(s.notifications_enabled, false) AS notifications_enabled,
       s.skip_hint_shown_at
     FROM (SELECT $1::uuid AS uid) u
     LEFT JOIN user_settings s ON s.user_id = u.uid`,
    [userId, yesterday, today]
  );
  const r = reflectMeta.rows[0];
  // Вопрос "Вчера/Сегодня" показываем только если за обе даты ещё нет рефлексий.
  // Если есть хотя бы за одну дату — идём напрямую (по текущей логике берём today).
  const skipDateQuestion = r?.has_yesterday || r?.has_today;

  if (skipDateQuestion) {
    await proceedWithReflectionDate(ctx, today, userId, deps);
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
      { text: 'Вчера', callback_data: 'reflect_date_yesterday' },
      { text: 'Сегодня', callback_data: 'reflect_date_today' },
    ],
  ];
  if (showSkipHint) {
    rows.push([{ text: 'Включить уведомления', callback_data: 'reflect_skip_enable_notif' }]);
  }

  ctx.session.step = 'reflect_date';
  await ctx.reply(questionText, { reply_markup: rows });
}

export async function handleReflect2Command(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /reflect2');
  ensureSession(ctx);
  ctx.session.reflectionPromptVariant = 'v2';
  await handleReflectCommand(ctx, deps);
}

export async function handleReflectSkipEnableNotif(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { settingsService, showSettingsMenu } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Reflect: skip hint, enable notif');
  await ctx.answerCallbackQuery();
  await settingsService.updateSkipHintShownAt(userId);
  await showSettingsMenu(ctx, userId);
}

export async function handleReflectDateChoice(ctx: AppContext, choice: 'yesterday' | 'today', deps: HandlerDeps): Promise<void> {
  const { getReflectDate } = deps;
  const userId = ctx.userId;
  logger.debug({ userId, choice }, 'Reflect date choice');
  await ctx.answerCallbackQuery();
  await proceedWithReflectionDate(ctx, await getReflectDate(userId, choice), userId, deps);
}

export async function handleReflectShow(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.debug({ userId }, 'Reflect show');
  ensureSession(ctx);
  const date = ctx.session.reflectionData?.date;
  ctx.session.step = undefined;
  ctx.session.reflectionData = undefined;
  if (!date) {
    await ctx.answerCallbackQuery();
    await ctx.reply('❌ Дата не выбрана.');
    return;
  }
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM daily_reflections WHERE user_id = $1 AND date = $2',
    [userId, date]
  );
  const rawPost = row.rows[0]?.raw_post ?? '';
  await ctx.answerCallbackQuery();
  await ctx.reply(formatLlmResponse(rawPost) || 'Рефлексия пуста.', { parse_mode: 'HTML' });
}

export async function handleReflectEdit(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = 'reflect_edit_confirm';
  await ctx.answerCallbackQuery();
  await ctx.reply('⚠️ GPT повторно вызываться не будет — ответы сохранятся для корректного обзора недели.\n\nПродолжить?', {
    reply_markup: [[
      { text: 'Да', callback_data: 'reflect_edit_confirm_yes' },
      { text: 'Нет', callback_data: 'reflect_edit_confirm_no' },
    ]],
  });
}

export async function handleReflectEditConfirmYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = 'reflect_movement';
  ctx.session.reflectionEditMode = true;
  await ctx.answerCallbackQuery();
  await ctx.reply(REFLECTION_MOVEMENT_QUESTION, {
    reply_markup: MOVEMENT_MARKUP,
  });
}

export async function handleReflectEditConfirmNo(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = undefined;
  ctx.session.reflectionData = undefined;
  await ctx.answerCallbackQuery();
  logger.debug({ userId: ctx.userId }, 'Reflect edit cancelled');
  await ctx.reply('👌 Отменено.');
}

export async function handleReflectNo(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.reflectionData ??= {};
  ctx.session.reflectionData.had_movement = false;
  ctx.session.reflectionData.movement_branch = 'no';
  ctx.session.step = 'reflect_nomovement_0';
  funnelStarted.inc({ type: 'reflect' });
  await ctx.answerCallbackQuery();
  await ctx.reply(REFLECTION_QUESTIONS_NO_MOVEMENT[0].text);
}

export async function handleReflectPartial(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.reflectionData ??= {};
  ctx.session.reflectionData.had_movement = false;
  ctx.session.reflectionData.movement_branch = 'partial';
  ctx.session.step = 'reflect_partial_0';
  funnelStarted.inc({ type: 'reflect' });
  await ctx.answerCallbackQuery();
  await ctx.reply(REFLECTION_QUESTIONS_PARTIAL[0].text);
}

export async function handleReflectWeekClosed(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.reflectionData ??= {};
  ctx.session.reflectionData.had_movement = false;
  ctx.session.reflectionData.movement_branch = 'week_closed';
  ctx.session.step = 'reflect_weekclosed_0';
  funnelStarted.inc({ type: 'reflect' });
  await ctx.answerCallbackQuery();
  await ctx.reply(REFLECTION_QUESTIONS_WEEK_CLOSED[0].text);
}

export async function handleReflectYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  ensureSession(ctx);
  ctx.session.reflectionData ??= {};
  ctx.session.reflectionData.had_movement = true;
  ctx.session.reflectionData.movement_branch = 'yes';
  ctx.session.step = 'reflect_movement_0';
  funnelStarted.inc({ type: 'reflect' });
  await ctx.answerCallbackQuery();
  await ctx.reply(REFLECTION_QUESTIONS_MOVEMENT[0].text);
}

const reflectionStepRe = /^reflect_(movement|nomovement|partial|weekclosed)_(\d+)$/;
const branchToQuestions = {
  movement: REFLECTION_QUESTIONS_MOVEMENT,
  nomovement: REFLECTION_QUESTIONS_NO_MOVEMENT,
  partial: REFLECTION_QUESTIONS_PARTIAL,
  weekclosed: REFLECTION_QUESTIONS_WEEK_CLOSED,
} as const;

export async function handleReflectionMessage(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { pool, reflectionService, handleLlmReply, formatErrorForUser } = deps;
  const userId = ctx.userId;
  const m = ctx.session!.step!.match(reflectionStepRe)!;
  const branch = m[1] as keyof typeof branchToQuestions;
  const idx = parseInt(m[2], 10);
  const questions = branchToQuestions[branch];
  const { key } = questions[idx];

  ctx.session!.reflectionData ??= {};
  ctx.session!.reflectionData![key] = text;

  if (idx >= questions.length - 1) {
    ctx.session!.step = undefined;
    const data = ctx.session!.reflectionData!;
    const isEdit = ctx.session!.reflectionEditMode ?? false;
    const variant = ctx.session!.reflectionPromptVariant ?? 'v1';
    const movementBranch = (data.movement_branch ?? (data.had_movement ? 'yes' : 'no')) as 'yes' | 'no' | 'partial' | 'week_closed';
    ctx.session!.reflectionData = undefined;
    ctx.session!.reflectionEditMode = undefined;

    const thoughtOfDay = String(data.thought_of_day ?? '');
    const payload = {
      date: data.date!,
      movement_branch: movementBranch,
      had_movement: movementBranch === 'yes',
      thought_of_day: thoughtOfDay,
      what_moved: data.what_moved as string | undefined,
      tomorrow_step: data.tomorrow_step as string | undefined,
      what_stopped: data.what_stopped as string | undefined,
      attention_sink: data.attention_sink as string | undefined,
      why_partial: data.why_partial as string | undefined,
      new_focus: data.new_focus as string | undefined,
    };

    try {
      if (isEdit) {
        const rawPost = await reflectionService.updateReflectionManual(userId, payload);
        funnelCompleted.inc({ type: 'reflect' });
        logger.info({ userId, date: data.date }, 'Reflection manually updated');
        await ctx.reply('❗️ Рефлексия обновлена.\n\n' + formatLlmResponse(rawPost?.trim() || ''), { parse_mode: 'HTML' });
      } else {
        await ctx.reply('🟢 Готовлю рефлексию...');
        const rawPost =
          variant === 'v2'
            ? await reflectionService.submitReflectionV2(userId, payload)
            : await reflectionService.submitReflection(userId, payload);
        funnelCompleted.inc({ type: 'reflect' });
        logger.info({ userId, date: data.date }, 'Reflection submitted');
        await handleLlmReply(ctx, rawPost ?? '', userId, 'reflect');
        await ctx.reply(ONBOARDING_AFTER_REFLECT);
        const hintRow = await pool.query<{ reflection_onboarding_hint_shown_at: Date | null }>(
          'SELECT reflection_onboarding_hint_shown_at FROM user_settings WHERE user_id = $1',
          [userId]
        );
        if (hintRow.rows[0]?.reflection_onboarding_hint_shown_at == null) {
          await ctx.reply(`<i>${ONBOARDING_AFTER_REFLECT_HINT}</i>`, { parse_mode: 'HTML' });
          await pool.query(
            `INSERT INTO user_settings (user_id, reflection_onboarding_hint_shown_at) VALUES ($1, NOW())
             ON CONFLICT (user_id) DO UPDATE SET reflection_onboarding_hint_shown_at = NOW(), updated_at = NOW()`,
            [userId]
          );
        }
      }
    } catch (err) {
      logger.error({ err, userId }, isEdit ? 'Reflection manual update failed' : 'Reflection submission failed');
      ctx.alertError?.(err, 'reflect', userId);
      await ctx.reply(formatErrorForUser(err));
    }
  } else {
    ctx.session!.step = `reflect_${branch}_${idx + 1}`;
    await ctx.reply(questions[idx + 1].text);
  }
}

export async function handleNotifyReflect(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { getReflectDate } = deps;
  const userId = ctx.userId;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId }, 'Notify reflect');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.reflectionData = {};
  const today = await getReflectDate(userId, 'today');
  await proceedWithReflectionDate(ctx, today, userId, deps);
}

export function registerReflectHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('reflect', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectCommand(appCtx, deps);
  });
  bot.command('reflect2', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflect2Command(appCtx, deps);
  });
  bot.callbackQuery('reflect_skip_enable_notif', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectSkipEnableNotif(appCtx, deps);
  });
  bot.callbackQuery('reflect_date_yesterday', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectDateChoice(appCtx, 'yesterday', deps);
  });
  bot.callbackQuery('reflect_date_today', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectDateChoice(appCtx, 'today', deps);
  });
  bot.callbackQuery('reflect_show', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectShow(appCtx, deps);
  });
  bot.callbackQuery('reflect_edit', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectEdit(appCtx, deps);
  });
  bot.callbackQuery('reflect_edit_confirm_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectEditConfirmYes(appCtx, deps);
  });
  bot.callbackQuery('reflect_edit_confirm_no', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectEditConfirmNo(appCtx, deps);
  });
  bot.callbackQuery('reflect_no', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectNo(appCtx, deps);
  });
  bot.callbackQuery('reflect_partial', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectPartial(appCtx, deps);
  });
  bot.callbackQuery('reflect_week_closed', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectWeekClosed(appCtx, deps);
  });
  bot.callbackQuery('reflect_yes', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflectYes(appCtx, deps);
  });
  bot.on('message:text').filter(
    (ctx) => {
      const m = ctx.session?.step?.match(reflectionStepRe);
      return !!m && !ctx.message.text?.trim().startsWith('/');
    },
    async (ctx) => {
      const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
      await handleReflectionMessage(appCtx, ctx.message.text ?? '', deps);
    }
  );
  bot.callbackQuery('notify_reflect', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleNotifyReflect(appCtx, deps);
  });
}
