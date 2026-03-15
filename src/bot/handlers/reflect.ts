import { InlineKeyboard } from 'grammy';
import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import {
  REFLECTION_DATE_QUESTION,
  REFLECTION_SKIP_HINT,
  REFLECTION_MOVEMENT_QUESTION,
  REFLECTION_QUESTIONS_MOVEMENT,
  REFLECTION_QUESTIONS_NO_MOVEMENT,
  REFLECTION_QUESTIONS_PARTIAL,
  REFLECTION_QUESTIONS_WEEK_CLOSED,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { funnelCompleted, funnelStarted } from '../../observability/metrics.js';
import { notifyDeveloper } from '../../observability/alert.js';
import { formatLlmResponse } from '../../domain/html.js';
import type { HandlerDeps } from './deps.js';

const movementKb = new InlineKeyboard()
  .text('Да', 'reflect_yes')
  .text('Нет', 'reflect_no')
  .row()
  .text('Частично', 'reflect_partial')
  .text('Результат недели уже закрыт', 'reflect_week_closed');

export function registerReflectHandlers(bot: import('grammy').Bot<BotContext>, deps: HandlerDeps): void {
  const {
    pool,
    ensureUser,
    getReflectDate,
    formatErrorForUser,
    handleLlmReply,
    showSettingsMenu,
    settingsService,
    reflectionService,
  } = deps;

  async function proceedWithReflectionDate(ctx: BotContext, date: string, userId: string) {
    ensureSession(ctx);
    ctx.session.reflectionData = { date };

    const existing = await pool.query(
      'SELECT 1 FROM daily_reflections WHERE user_id = $1 AND date = $2',
      [userId, date]
    );

    if (existing.rows.length > 0) {
      ctx.session.step = 'reflect_choice';
      await ctx.reply(`Рефлексия за ${date} уже есть.`, {
        reply_markup: new InlineKeyboard()
          .text('Показать', 'reflect_show')
          .text('Изменить', 'reflect_edit'),
      });
      return;
    }

    ctx.session.step = 'reflect_movement';
    ctx.session.reflectionEditMode = false;
    await ctx.reply(REFLECTION_MOVEMENT_QUESTION, { reply_markup: movementKb });
  }

  bot.command('reflect', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.info({ tgId }, 'Command /reflect');
    ensureSession(ctx);
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
    const skipDateQuestion = (r?.total ?? 0) === 0 || r?.has_yesterday || r?.has_today;

    if (skipDateQuestion) {
      await proceedWithReflectionDate(ctx, today, userId);
      return;
    }

    const s = r;
    const showSkipHint =
      !s?.notifications_enabled && s?.skip_hint_shown_at == null;
    const questionText = showSkipHint
      ? `${REFLECTION_DATE_QUESTION}\n\n<i>${REFLECTION_SKIP_HINT}</i>`
      : REFLECTION_DATE_QUESTION;
    const kb = new InlineKeyboard()
      .text('Вчера', 'reflect_date_yesterday')
      .text('Сегодня', 'reflect_date_today');
    if (showSkipHint) {
      kb.row().text('Включить уведомления', 'reflect_skip_enable_notif');
    }

    ctx.session.step = 'reflect_date';
    await ctx.reply(questionText, {
      parse_mode: 'HTML',
      reply_markup: kb,
    });
  });

  bot.callbackQuery('reflect_skip_enable_notif', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.debug({ userId }, 'Reflect: skip hint, enable notif');
    await ctx.answerCallbackQuery();
    await settingsService.updateSkipHintShownAt(userId);
    await showSettingsMenu(ctx, userId);
  });

  async function handleReflectDateChoice(ctx: BotContext, choice: 'yesterday' | 'today') {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.debug({ userId, choice }, 'Reflect date choice');
    await ctx.answerCallbackQuery();
    await proceedWithReflectionDate(ctx, await getReflectDate(userId, choice), userId);
  }

  bot.callbackQuery('reflect_date_yesterday', (ctx) => handleReflectDateChoice(ctx, 'yesterday'));
  bot.callbackQuery('reflect_date_today', (ctx) => handleReflectDateChoice(ctx, 'today'));

  bot.callbackQuery('reflect_show', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
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
  });

  bot.callbackQuery('reflect_edit', async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    logger.debug({ userId }, 'Reflect edit');
    ensureSession(ctx);
    ctx.session.step = 'reflect_edit_confirm';
    await ctx.answerCallbackQuery();
    await ctx.reply('⚠️ GPT повторно вызываться не будет — ответы сохранятся для корректного обзора недели.\n\nПродолжить?', {
      reply_markup: new InlineKeyboard()
        .text('Да', 'reflect_edit_confirm_yes')
        .text('Нет', 'reflect_edit_confirm_no'),
    });
  });

  bot.callbackQuery('reflect_edit_confirm_yes', async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    logger.debug({ userId }, 'Reflect edit confirm yes');
    ensureSession(ctx);
    ctx.session.step = 'reflect_movement';
    ctx.session.reflectionEditMode = true;
    await ctx.answerCallbackQuery();
    await ctx.reply(REFLECTION_MOVEMENT_QUESTION, { reply_markup: movementKb });
  });

  bot.callbackQuery('reflect_edit_confirm_no', async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    ensureSession(ctx);
    ctx.session.step = undefined;
    ctx.session.reflectionData = undefined;
    await ctx.answerCallbackQuery();
    logger.debug({ userId }, 'Reflect edit cancelled');
    await ctx.reply('👌 Отменено.');
  });

  bot.callbackQuery('reflect_no', async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    logger.debug({ userId }, 'Reflect: had movement no');
    ensureSession(ctx);
    ctx.session.reflectionData ??= {};
    ctx.session.reflectionData.had_movement = false;
    ctx.session.reflectionData.movement_branch = 'no';
    ctx.session.step = 'reflect_nomovement_0';
    funnelStarted.inc({ type: 'reflect' });
    await ctx.answerCallbackQuery();
    await ctx.reply(REFLECTION_QUESTIONS_NO_MOVEMENT[0].text);
  });

  bot.callbackQuery('reflect_partial', async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    logger.debug({ userId }, 'Reflect: partial');
    ensureSession(ctx);
    ctx.session.reflectionData ??= {};
    ctx.session.reflectionData.had_movement = false;
    ctx.session.reflectionData.movement_branch = 'partial';
    ctx.session.step = 'reflect_partial_0';
    funnelStarted.inc({ type: 'reflect' });
    await ctx.answerCallbackQuery();
    await ctx.reply(REFLECTION_QUESTIONS_PARTIAL[0].text);
  });

  bot.callbackQuery('reflect_week_closed', async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    logger.debug({ userId }, 'Reflect: week closed');
    ensureSession(ctx);
    ctx.session.reflectionData ??= {};
    ctx.session.reflectionData.had_movement = false;
    ctx.session.reflectionData.movement_branch = 'week_closed';
    ctx.session.step = 'reflect_weekclosed_0';
    funnelStarted.inc({ type: 'reflect' });
    await ctx.answerCallbackQuery();
    await ctx.reply(REFLECTION_QUESTIONS_WEEK_CLOSED[0].text);
  });

  bot.callbackQuery('reflect_yes', async (ctx) => {
    const userId = await ensureUser(String(ctx.from?.id ?? ''));
    logger.debug({ userId }, 'Reflect: had movement yes');
    ensureSession(ctx);
    ctx.session.reflectionData ??= {};
    ctx.session.reflectionData.had_movement = true;
    ctx.session.reflectionData.movement_branch = 'yes';
    ctx.session.step = 'reflect_movement_0';
    funnelStarted.inc({ type: 'reflect' });
    await ctx.answerCallbackQuery();
    await ctx.reply(REFLECTION_QUESTIONS_MOVEMENT[0].text);
  });

  const reflectionStepRe = /^reflect_(movement|nomovement|partial|weekclosed)_(\d+)$/;
  const branchToQuestions = {
    movement: REFLECTION_QUESTIONS_MOVEMENT,
    nomovement: REFLECTION_QUESTIONS_NO_MOVEMENT,
    partial: REFLECTION_QUESTIONS_PARTIAL,
    weekclosed: REFLECTION_QUESTIONS_WEEK_CLOSED,
  } as const;

  bot.on('message:text').filter((ctx) => {
    const m = ctx.session?.step?.match(reflectionStepRe);
    return !!m && !ctx.message.text?.trim().startsWith('/');
  }, async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    const m = ctx.session!.step!.match(reflectionStepRe)!;
    const branch = m[1] as keyof typeof branchToQuestions;
    const idx = parseInt(m[2], 10);
    const questions = branchToQuestions[branch];
    const { key } = questions[idx];

    ctx.session!.reflectionData ??= {};
    ctx.session!.reflectionData![key] = ctx.message.text;

    if (idx >= questions.length - 1) {
      ctx.session!.step = undefined;
      const data = ctx.session!.reflectionData!;
      const isEdit = ctx.session!.reflectionEditMode ?? false;
      const movementBranch = (data.movement_branch ?? (data.had_movement ? 'yes' : 'no')) as 'yes' | 'no' | 'partial' | 'week_closed';
      ctx.session!.reflectionData = undefined;
      ctx.session!.reflectionEditMode = undefined;

      const thoughtOfDay = movementBranch === 'week_closed' ? '' : String(data.thought_of_day ?? '');
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
          const rawPost = await reflectionService.submitReflection(userId, payload);
          funnelCompleted.inc({ type: 'reflect' });
          logger.info({ userId, date: data.date }, 'Reflection submitted');
          await handleLlmReply(ctx, rawPost ?? '', userId, 'reflect');
        }
      } catch (err) {
        logger.error({ err, userId }, isEdit ? 'Reflection manual update failed' : 'Reflection submission failed');
        notifyDeveloper(ctx.api, err, 'reflect', userId);
        await ctx.reply(formatErrorForUser(err));
      }
    } else {
      ctx.session!.step = `reflect_${branch}_${idx + 1}`;
      await ctx.reply(questions[idx + 1].text);
    }
  });

  bot.callbackQuery('notify_reflect', async (ctx) => {
    const tgId = String(ctx.from?.id ?? '');
    const userId = await ensureUser(tgId);
    logger.info({ tgId, userId }, 'Notify reflect');
    await ctx.answerCallbackQuery();
    ensureSession(ctx);
    ctx.session.reflectionData = {};
    const today = await getReflectDate(userId, 'today');
    await proceedWithReflectionDate(ctx, today, userId);
  });
}
