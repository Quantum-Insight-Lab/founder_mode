import type { Bot } from 'grammy';
import type { BotContext } from '../../context.js';
import { ensureSession } from '../../context.js';
import { buildAppContext } from '../../transport/telegram-adapter.js';
import type { AppContext } from '../../transport/types.js';
import {
  CLOSURE_ONBOARDING_INTRO,
  CLOSURE_ONBOARDING_MSG_1,
  CLOSURE_ONBOARDING_MSG_2,
  CLOSURE_ONBOARDING_MSG_3,
  CLOSURE_ONBOARDING_CTA_QUESTION,
  CLOSURE_ONBOARDING_AFTER_CTA_YES,
  CLOSURE_ONBOARDING_TIMEZONE_QUESTION,
  CLOSURE_ONBOARDING_TIMEZONE_INVALID,
  CLOSURE_ONBOARDING_TIMEZONE_DEFAULT,
  CLOSURE_ONBOARDING_AFTER_TZ_PROMPT_MATTER,
  CLOSURE_ONBOARDING_REMINDERS_ENABLED,
  CLOSURE_ONBOARDING_REMINDERS_DISABLED_SHORT,
  CLOSURE_ONBOARDING_CTA_LATER_FIRST_MSG,
  CLOSURE_ONBOARDING_CTA_YES_FINAL_MSG,
  CLOSURE_ONBOARDING_CTA_LATER_MSG,
  CLOSURE_ONBOARDING_AFTER_DIGEST_1,
  CLOSURE_ONBOARDING_AFTER_DIGEST_QUESTION,
} from '../../closure-conversations.js';
import { logger } from '../../../observability/logger.js';
import { botOpens, experimentCompleted, experimentStarted } from '../../../observability/metrics.js';
import { userTimeToTimezone } from '../../../domain/timezone.js';
import type { HandlerDeps } from '../deps.js';

const ONBOARD_NOTIF_OFF: import('../../transport/types.js').InlineButton[][] = [
  [
    { text: 'Отключить напоминания', callback_data: 'onboard_notif_off' },
    { text: 'Изменить время напоминаний', callback_data: 'settings_notifications' },
  ],
];

export async function handleClosureStart(
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

  if (onboardingStarted || onboardingCompleted) {
    await ctx.reply(CLOSURE_ONBOARDING_INTRO, { parse_mode: 'HTML' });
    return;
  }

  ensureSession(ctx);
  ctx.session.step = 'onboard_cta';
  await ctx.reply(CLOSURE_ONBOARDING_MSG_1);
  await ctx.reply(CLOSURE_ONBOARDING_MSG_2);
  await ctx.reply(CLOSURE_ONBOARDING_MSG_3);
  await ctx.reply(CLOSURE_ONBOARDING_CTA_QUESTION, {
    reply_markup: [[
      { text: 'Да', callback_data: 'onboard_cta_yes' },
      { text: 'Позже', callback_data: 'onboard_cta_later' },
    ]],
  });
}

export async function handleClosureOnboardTimezone(ctx: AppContext, text: string, deps: HandlerDeps): Promise<void> {
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
    await settingsService.updateTimezone(userId, CLOSURE_ONBOARDING_TIMEZONE_DEFAULT);
    await ctx.reply(CLOSURE_ONBOARDING_TIMEZONE_INVALID, { parse_mode: 'HTML' });
    await ctx.reply(`Часовой пояс установлен: <b>${CLOSURE_ONBOARDING_TIMEZONE_DEFAULT}</b>`, { parse_mode: 'HTML' });
    await ctx.reply(CLOSURE_ONBOARDING_AFTER_TZ_PROMPT_MATTER);
    return;
  }

  await settingsService.updateTimezone(userId, tz);
  await settingsService.updateNotificationsEnabled(userId, true);
  await settingsService.updateDeclarationNotify(userId, 1, '10:00');
  await settingsService.updateFixationNotify(userId, '1,2,3,4,5', '21:00');
  await settingsService.updateReportNotify(userId, 0, '12:00');
  logger.info({ userId }, 'Onboarding timezone saved');
  await ctx.reply(
    `Часовой пояс установлен: <b>${tz}</b>\n\n${CLOSURE_ONBOARDING_REMINDERS_ENABLED}`,
    { parse_mode: 'HTML', reply_markup: ONBOARD_NOTIF_OFF }
  );
  await ctx.reply(CLOSURE_ONBOARDING_AFTER_TZ_PROMPT_MATTER);
}

export async function handleClosureOnboardNotifOff(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await settingsService.updateNotificationsEnabled(userId, false);
  logger.info({ userId }, 'Onboarding: reminders disabled via button');
  await ctx.reply(CLOSURE_ONBOARDING_REMINDERS_DISABLED_SHORT);
}

export async function handleClosureOnboardCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: CTA yes');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'onboard_timezone';
  await pool.query('UPDATE users SET onboarding_started_at = NOW() WHERE user_id = $1', [userId]);
  experimentStarted.inc();
  await ctx.reply(CLOSURE_ONBOARDING_AFTER_CTA_YES);
  await ctx.reply(CLOSURE_ONBOARDING_TIMEZONE_QUESTION);
}

export async function handleClosureOnboardCtaLater(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.info({ userId: ctx.userId }, 'Onboarding: CTA later');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await ctx.reply(CLOSURE_ONBOARDING_CTA_LATER_FIRST_MSG);
}

export async function handleClosureOnboardDigestCtaYes(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: digest CTA yes');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  experimentCompleted.inc();
  await ctx.reply(CLOSURE_ONBOARDING_CTA_YES_FINAL_MSG);
}

export async function handleClosureOnboardDigestCtaLater(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  logger.info({ userId }, 'Onboarding: digest CTA later');
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  experimentCompleted.inc();
  await ctx.reply(CLOSURE_ONBOARDING_CTA_LATER_MSG);
}

export { CLOSURE_ONBOARDING_AFTER_DIGEST_1, CLOSURE_ONBOARDING_AFTER_DIGEST_QUESTION };

export function registerClosureOnboardingHandlers(_bot: Bot<BotContext>, _deps: HandlerDeps): void {
  // /start and shared onboard callbacks registered in product-mode.ts
}
