import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import {
  ONBOARDING_INTRO,
  ONBOARDING_MSG_1,
  ONBOARDING_MSG_2,
  ONBOARDING_MSG_3,
  ONBOARDING_CTA_QUESTION,
  ONBOARDING_AFTER_CTA_YES,
  ONBOARDING_TIMEZONE_QUESTION,
  ONBOARDING_TIMEZONE_INVALID,
  ONBOARDING_TIMEZONE_DEFAULT,
  ONBOARDING_AFTER_TZ_PROMPT_PLAN,
  ONBOARDING_REMINDERS_ENABLED,
  ONBOARDING_REMINDERS_DISABLED_SHORT,
  ONBOARDING_CTA_LATER_FIRST_MSG,
  ONBOARDING_CTA_YES_FINAL_MSG,
  ONBOARDING_CTA_LATER_MSG,
} from '../conversations.js';
import { logger } from '../../observability/logger.js';
import { botOpens, experimentCompleted, experimentStarted } from '../../observability/metrics.js';
import { userTimeToTimezone } from '../../domain/timezone.js';
import type { HandlerDeps } from './deps.js';

const ONBOARD_NOTIF_OFF: import('../transport/types.js').InlineButton[][] = [
  [
    { text: 'Отключить напоминания', callback_data: 'onboard_notif_off' },
    { text: 'Изменить время напоминаний', callback_data: 'settings_notifications' },
  ],
];

export async function handleStart(
  ctx: AppContext,
  deps: HandlerDeps,
  opts?: { skipBotOpen?: boolean }
): Promise<void> {
  const { pool } = deps;
  if (!opts?.skipBotOpen) botOpens.inc();
  const userId = ctx.userId;
  const r = await pool.query<{ onboarding_completed_at: Date | null; onboarding_started_at: Date | null }>(
    'SELECT onboarding_completed_at, onboarding_started_at FROM users WHERE user_id = $1',
    [userId]
  );
  const onboardingCompleted = r.rows[0]?.onboarding_completed_at != null;
  const onboardingStarted = r.rows[0]?.onboarding_started_at != null;
  logger.info({ channel: ctx.channel, externalId: ctx.externalId, userId, onboardingCompleted }, 'Command /start');

  // Once the user explicitly opted into the experiment (CTA "Да"), /start should show the concise intro.
  // Completion is tracked separately (e.g. after first report CTA).
  if (onboardingStarted || onboardingCompleted) {
    await ctx.reply(ONBOARDING_INTRO, { parse_mode: 'HTML' });
    return;
  }

  ensureSession(ctx);
  ctx.session.step = 'onboard_cta';
  await ctx.reply(ONBOARDING_MSG_1);
  await ctx.reply(ONBOARDING_MSG_2);
  await ctx.reply(ONBOARDING_MSG_3);
  await ctx.reply(ONBOARDING_CTA_QUESTION, {
    reply_markup: [[
      { text: 'Да', callback_data: 'onboard_cta_yes' },
      { text: 'Позже', callback_data: 'onboard_cta_later' },
    ]],
  });
}

export async function handleOnboardTimezone(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const match = text.match(/(\d{1,2}):(\d{2})/);
  ensureSession(ctx);
  ctx.session.step = undefined;

  let tz: string | null = null;
  if (match) {
    tz = userTimeToTimezone(parseInt(match[1], 10), parseInt(match[2], 10));
  }

  if (!tz) {
    logger.info({ userId, text }, 'Onboarding timezone invalid, using default UTC+3');
    await settingsService.updateTimezone(userId, ONBOARDING_TIMEZONE_DEFAULT);
    await ctx.reply(ONBOARDING_TIMEZONE_INVALID, { parse_mode: 'HTML' });
    await ctx.reply(`Часовой пояс установлен: <b>${ONBOARDING_TIMEZONE_DEFAULT}</b>`, { parse_mode: 'HTML' });
    await ctx.reply(ONBOARDING_AFTER_TZ_PROMPT_PLAN);
    return;
  }

  await settingsService.updateTimezone(userId, tz);
  await settingsService.updateNotificationsEnabled(userId, true);
  await settingsService.updateDeclarationNotify(userId, 1, '10:00');
  await settingsService.updateFixationNotify(userId, '1,2,3,4,5', '21:00');
  await settingsService.updateReportNotify(userId, 0, '12:00');
  logger.info({ userId }, 'Onboarding timezone saved');
  await ctx.reply(
    `Часовой пояс установлен: <b>${tz}</b>\n\n${ONBOARDING_REMINDERS_ENABLED}`,
    { parse_mode: 'HTML', reply_markup: ONBOARD_NOTIF_OFF }
  );
  await ctx.reply(ONBOARDING_AFTER_TZ_PROMPT_PLAN);
}

export async function handleOnboardNotifOff(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await settingsService.updateNotificationsEnabled(userId, false);
  logger.info({ userId }, 'Onboarding: reminders disabled via button');
  await ctx.reply(ONBOARDING_REMINDERS_DISABLED_SHORT);
}

export async function handleOnboardCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: CTA yes');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'onboard_timezone';
  await pool.query('UPDATE users SET onboarding_started_at = NOW() WHERE user_id = $1', [userId]);
  experimentStarted.inc();
  await ctx.reply(ONBOARDING_AFTER_CTA_YES);
  await ctx.reply(ONBOARDING_TIMEZONE_QUESTION);
}

export async function handleOnboardCtaLater(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.info({ userId: ctx.userId }, 'Onboarding: CTA later');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await ctx.reply(ONBOARDING_CTA_LATER_FIRST_MSG);
}

export async function handleOnboardReportCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: report CTA yes');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  experimentCompleted.inc();
  await ctx.reply(ONBOARDING_CTA_YES_FINAL_MSG);
}

export async function handleOnboardReportCtaLater(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: report CTA later');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  experimentCompleted.inc();
  await ctx.reply(ONBOARDING_CTA_LATER_MSG);
}

export function registerOnboardingHandlers(_bot: Bot<BotContext>, _deps: HandlerDeps): void {
  // /start and shared onboard callbacks registered in product-mode.ts
}
