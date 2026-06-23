import { ensureSession } from '../../context.js';
import type { AppContext } from '../../transport/types.js';
import type { EngineMode } from '../../../services/product-mode.js';
import type { ModeConfig } from '../../../modes/types.js';
import { FLOW_CHOICE_USE_BUTTONS_HINT } from '../../../modes/shared.js';
import { logger } from '../../../observability/logger.js';
import { cardEditClicks } from '../../../observability/metrics.js';
import { getUserLocalDate, getUserLocalTimeHHmm } from '../../../db/user-timezone.js';
import { instantToUserLocalDateString, parseTimezoneOffset } from '../../../domain/timezone.js';
import { getWeekId } from '../../../services/week-service.js';
import { renderEngineCardPng } from '../../../services/engine/card-render.js';
import type { HandlerDeps } from '../deps.js';

const MOVEMENT_MARKUP: import('../../transport/types.js').InlineButton[][] = [
  [
    { text: 'Да', callback_data: 'engine_move_yes' },
    { text: 'Нет', callback_data: 'engine_move_no' },
    { text: 'Частично', callback_data: 'engine_move_partial' },
  ],
];

async function sendLogCard(ctx: AppContext, deps: HandlerDeps, userId: string, rawPost: string): Promise<void> {
  const { handleLlmReply, pool, resolveAvatarBackgroundImage, getRhythmLineForCard } = deps;
  const timeHHmm = await getUserLocalTimeHHmm(userId, pool);
  const username = ctx.displayName?.trim() || 'User';
  const avatarBackgroundImage = await resolveAvatarBackgroundImage(ctx, userId);
  const rhythmLine = (await getRhythmLineForCard(userId)) ?? undefined;
  try {
    const png = await renderEngineCardPng(
      { username, content: rawPost, timeHHmm, avatarBackgroundImage, rhythmLine },
      'engine_log'
    );
    if (ctx.replyImage) {
      await ctx.replyImage(png, 'log.png');
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'Engine log card PNG failed');
  }
  await handleLlmReply(ctx, rawPost, userId, 'step');
}

async function proceedWithLogDate(
  ctx: AppContext,
  date: string,
  userId: string,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const { pool } = deps;
  ensureSession(ctx);
  ctx.session.engineLogData = { date };

  const weekId = getWeekId(await getUserLocalDate(userId, pool));
  const hasFocus = await pool.query(
    'SELECT 1 FROM engine_commitments WHERE user_id = $1 AND mode = $2 AND week_id = $3 LIMIT 1',
    [userId, mode, weekId]
  );
  if (hasFocus.rows.length === 0) {
    ctx.session.step = undefined;
    await ctx.reply(config.daily.needFocusHint);
    return;
  }

  const existing = await pool.query(
    'SELECT 1 FROM engine_steps WHERE user_id = $1 AND mode = $2 AND date = $3',
    [userId, mode, date]
  );
  if (existing.rows.length > 0) {
    ctx.session.step = 'engine_log_choice';
    await ctx.reply(`Запись за ${date} уже есть.`, {
      reply_markup: [[
        { text: 'Показать', callback_data: 'engine_log_show' },
        { text: 'Изменить', callback_data: 'engine_log_edit' },
      ]],
    });
    return;
  }

  ctx.session.step = 'engine_log_movement';
  ctx.session.engineLogEditMode = false;
  await ctx.reply(config.daily.movementQuestion, { reply_markup: MOVEMENT_MARKUP });
}

export async function handleLogCommandBase(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const { pool, getLogDate } = deps;
  const userId = ctx.userId;
  ensureSession(ctx);
  ctx.session.engineLogData = {};

  const userDateStr = await getUserLocalDate(userId, pool);
  const weekId = getWeekId(userDateStr);
  const hasFocus = await pool.query(
    'SELECT 1 FROM engine_commitments WHERE user_id = $1 AND mode = $2 AND week_id = $3 LIMIT 1',
    [userId, mode, weekId]
  );
  if (hasFocus.rows.length === 0) {
    ctx.session.step = undefined;
    await ctx.reply(config.daily.needFocusHint);
    return;
  }

  const yesterday = await getLogDate(userId, 'yesterday');
  const today = await getLogDate(userId, 'today');
  const meta = await pool.query<{
    has_yesterday: boolean;
    has_today: boolean;
    focus_created_at: string | null;
    notifications_enabled: boolean;
    skip_hint_shown_at: string | null;
    timezone: string | null;
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM engine_steps WHERE user_id = $1 AND mode = $2 AND date = $3) AS has_yesterday,
       EXISTS(SELECT 1 FROM engine_steps WHERE user_id = $1 AND mode = $2 AND date = $4) AS has_today,
       (SELECT ec.created_at FROM engine_commitments ec WHERE ec.user_id = $1 AND ec.mode = $2 AND ec.week_id = $5) AS focus_created_at,
       COALESCE(s.notifications_enabled, false) AS notifications_enabled,
       s.skip_hint_shown_at, s.timezone
     FROM (SELECT $1::uuid AS uid) u LEFT JOIN user_settings s ON s.user_id = u.uid`,
    [userId, mode, yesterday, today, weekId]
  );
  const r = meta.rows[0];
  const offsetMin = r?.timezone ? parseTimezoneOffset(r.timezone) : null;
  const focusAt = r?.focus_created_at ? new Date(r.focus_created_at) : null;
  const focusLocalDate = focusAt ? instantToUserLocalDateString(focusAt, offsetMin) : null;
  const skipDate = r?.has_yesterday || r?.has_today || focusLocalDate === today;

  if (skipDate) {
    await proceedWithLogDate(ctx, today, userId, deps, mode, config);
    return;
  }

  const showSkipHint = !r?.notifications_enabled && r?.skip_hint_shown_at == null;
  if (showSkipHint) await ctx.reply(`<i>${config.daily.skipHint}</i>`, { parse_mode: 'HTML' });

  const rows: import('../../transport/types.js').InlineButton[][] = [
    [
      { text: 'Вчера', callback_data: 'engine_log_date_yesterday' },
      { text: 'Сегодня', callback_data: 'engine_log_date_today' },
    ],
  ];
  if (showSkipHint) rows.push([{ text: 'Включить напоминания', callback_data: 'engine_log_skip_enable_notif' }]);
  ctx.session.step = 'engine_log_date';
  await ctx.reply(config.daily.dateQuestion, { reply_markup: rows });
}

export async function handleLogCommand(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  logger.info({ channel: ctx.channel, mode }, 'Command /log');
  await handleLogCommandBase(ctx, deps, mode, config);
}

export async function handleLogDateChoice(
  ctx: AppContext,
  choice: 'yesterday' | 'today',
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  const date = await deps.getLogDate(userId, choice);
  await proceedWithLogDate(ctx, date, userId, deps, mode, config);
}

export async function handleLogShow(ctx: AppContext, deps: HandlerDeps, mode: EngineMode): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  const date = ctx.session?.engineLogData?.date;
  ctx.session!.step = undefined;
  await ctx.answerCallbackQuery();
  if (!date) {
    await ctx.reply('❌ Дата не выбрана.');
    return;
  }
  const row = await pool.query<{ raw_post: string }>(
    'SELECT raw_post FROM engine_steps WHERE user_id = $1 AND mode = $2 AND date = $3',
    [userId, mode, date]
  );
  const raw = row.rows[0]?.raw_post ?? '';
  if (!raw.trim()) {
    await ctx.reply('Пусто.');
    return;
  }
  await sendLogCard(ctx, deps, userId, raw);
}

export async function handleLogEdit(ctx: AppContext, deps: HandlerDeps, config: ModeConfig): Promise<void> {
  ensureSession(ctx);
  ctx.session.step = 'engine_log_movement';
  ctx.session.engineLogEditMode = true;
  await ctx.answerCallbackQuery();
  cardEditClicks.inc({ kind: 'step' });
  await ctx.reply(config.daily.movementQuestion, { reply_markup: MOVEMENT_MARKUP });
}

function startBranch(ctx: AppContext, branch: 'yes' | 'no' | 'partial', config: ModeConfig): void {
  ensureSession(ctx);
  ctx.session.engineLogData ??= {};
  ctx.session.engineLogData.movement_branch = branch;
  const questions = config.daily.branches[branch];
  ctx.session.step = `engine_log_${branch}_0`;
}

export async function handleLogMoveYes(ctx: AppContext, config: ModeConfig): Promise<void> {
  await ctx.answerCallbackQuery();
  startBranch(ctx, 'yes', config);
  await ctx.reply(config.daily.branches.yes[0].text);
}

export async function handleLogMoveNo(ctx: AppContext, config: ModeConfig): Promise<void> {
  await ctx.answerCallbackQuery();
  startBranch(ctx, 'no', config);
  await ctx.reply(config.daily.branches.no[0].text);
}

export async function handleLogMovePartial(ctx: AppContext, config: ModeConfig): Promise<void> {
  await ctx.answerCallbackQuery();
  startBranch(ctx, 'partial', config);
  await ctx.reply(config.daily.branches.partial[0].text);
}

const logStepRe = /^engine_log_(yes|no|partial)_(\d+)$/;

export async function handleLogMessage(
  ctx: AppContext,
  text: string,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  const { engineServices, replyWithServiceError } = deps;
  const userId = ctx.userId;
  const step = ctx.session!.step!;

  if (step === 'engine_log_choice') {
    if (!text.trim().startsWith('/')) await ctx.reply(FLOW_CHOICE_USE_BUTTONS_HINT);
    return;
  }

  const m = step.match(logStepRe);
  if (!m) return;
  const branch = m[1] as 'yes' | 'no' | 'partial';
  const idx = parseInt(m[2], 10);
  const questions = config.daily.branches[branch];
  const { key } = questions[idx];
  ctx.session!.engineLogData ??= {};
  ctx.session!.engineLogData[key] = text;

  if (idx >= questions.length - 1) {
    ctx.session!.step = undefined;
    const data = ctx.session!.engineLogData!;
    const isEdit = ctx.session!.engineLogEditMode ?? false;
    const answers: Record<string, string> = {};
    for (const q of questions) answers[q.key] = String(data[q.key] ?? '');
    const payload = {
      date: String(data.date),
      movement_branch: branch,
      answers,
    };
    ctx.session!.engineLogData = undefined;
    ctx.session!.engineLogEditMode = undefined;

    try {
      await ctx.reply(config.daily.preparingText);
      const rawPost = isEdit
        ? await engineServices.step.updateStepManual(userId, mode, payload)
        : await engineServices.step.submitStep(userId, mode, payload);
      if (isEdit) await ctx.reply('❗️ Обновлено.');
      await sendLogCard(ctx, deps, userId, rawPost);
      await ctx.reply(config.onboarding.afterLogHint);
    } catch (err) {
      logger.error({ err, userId, mode }, 'Engine log failed');
      ctx.alertError?.(err, 'step', userId);
      await replyWithServiceError(ctx, err, userId, 'step');
    }
  } else {
    ctx.session!.step = `engine_log_${branch}_${idx + 1}`;
    await ctx.reply(questions[idx + 1].text);
  }
}

export async function handleNotifyLog(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig
): Promise<void> {
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  await handleLogCommandBase(ctx, deps, mode, config);
}

export async function handleLogSkipEnableNotif(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  await ctx.answerCallbackQuery();
  await deps.settingsService.updateSkipHintShownAt(ctx.userId);
  await deps.showSettingsMenu(ctx, ctx.userId);
}
