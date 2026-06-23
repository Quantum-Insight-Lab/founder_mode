import type { AppContext } from '../../transport/types.js';
import { ensureSession } from '../../context.js';
import type { EngineMode } from '../../../services/product-mode.js';
import type { ModeConfig } from '../../../modes/types.js';
import {
  ENGINE_AFTER_CTA_YES,
  ENGINE_REMINDERS_DISABLED_SHORT,
  ENGINE_REMINDERS_ENABLED,
  ENGINE_TIMEZONE_DEFAULT,
  ENGINE_TIMEZONE_INVALID,
  ENGINE_TIMEZONE_QUESTION,
} from '../../../modes/shared.js';
import { logger } from '../../../observability/logger.js';
import { botOpens } from '../../../observability/metrics.js';
import { userTimeToTimezone } from '../../../domain/timezone.js';
import type { HandlerDeps } from '../deps.js';

const ONBOARD_NOTIF_OFF: import('../../transport/types.js').InlineButton[][] = [
  [
    { text: 'Отключить напоминания', callback_data: 'onboard_notif_off' },
    { text: 'Изменить время напоминаний', callback_data: 'settings_notifications' },
  ],
];

export async function handleEngineStart(
  ctx: AppContext,
  deps: HandlerDeps,
  mode: EngineMode,
  config: ModeConfig,
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
  logger.info({ channel: ctx.channel, userId, mode, onboardingCompleted }, 'Engine /start');

  if (onboardingStarted || onboardingCompleted) {
    await ctx.reply(config.onboarding.intro, { parse_mode: 'HTML' });
    return;
  }

  ensureSession(ctx);
  ctx.session.step = 'onboard_cta';
  for (const msg of config.onboarding.msgs) {
    await ctx.reply(msg);
  }
  await ctx.reply(config.onboarding.ctaQuestion, {
    reply_markup: [[
      { text: 'Да', callback_data: 'onboard_cta_yes' },
      { text: 'Позже', callback_data: 'onboard_cta_later' },
    ]],
  });
}

export async function handleEngineOnboardCtaYes(ctx: AppContext, deps: HandlerDeps, _config: ModeConfig): Promise<void> {
  const { pool } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = 'onboard_timezone';
  await pool.query('UPDATE users SET onboarding_started_at = NOW() WHERE user_id = $1', [userId]);
  await ctx.reply(ENGINE_AFTER_CTA_YES);
  await ctx.reply(ENGINE_TIMEZONE_QUESTION);
}

export async function handleEngineOnboardCtaLater(ctx: AppContext, deps: HandlerDeps, config: ModeConfig): Promise<void> {
  const { pool, markOnboarded } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  ensureSession(ctx);
  ctx.session.step = undefined;
  await markOnboarded(userId);
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  await ctx.reply(`Ок. Когда захочешь — /focus.\n\n${config.onboarding.intro}`);
}

export async function handleEngineOnboardTimezone(
  ctx: AppContext,
  text: string,
  deps: HandlerDeps,
  config: ModeConfig
): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  const match = text.match(/(\d{1,2}):(\d{2})/);
  ensureSession(ctx);
  ctx.session.step = undefined;

  let tz: string | null = null;
  if (match) tz = userTimeToTimezone(parseInt(match[1], 10), parseInt(match[2], 10));

  if (!tz) {
    await settingsService.updateTimezone(userId, ENGINE_TIMEZONE_DEFAULT);
    await ctx.reply(ENGINE_TIMEZONE_INVALID, { parse_mode: 'HTML' });
    await ctx.reply(`Часовой пояс установлен: <b>${ENGINE_TIMEZONE_DEFAULT}</b>`, { parse_mode: 'HTML' });
    await ctx.reply(config.onboarding.afterTzPrompt);
    return;
  }

  await settingsService.updateTimezone(userId, tz);
  await settingsService.updateNotificationsEnabled(userId, true);
  await settingsService.updateDeclarationNotify(userId, 1, '10:00');
  await settingsService.updateFixationNotify(userId, '1,2,3,4,5', '21:00');
  await settingsService.updateReportNotify(userId, 0, '12:00');
  await ctx.reply(
    `Часовой пояс установлен: <b>${tz}</b>\n\n${ENGINE_REMINDERS_ENABLED}`,
    { parse_mode: 'HTML', reply_markup: ONBOARD_NOTIF_OFF }
  );
  await ctx.reply(config.onboarding.afterTzPrompt);
}

export async function handleEngineOnboardNotifOff(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  const { settingsService } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await settingsService.updateNotificationsEnabled(userId, false);
  await ctx.reply(ENGINE_REMINDERS_DISABLED_SHORT);
}

export async function handleEngineOnboardDigestCtaYes(
  ctx: AppContext,
  deps: HandlerDeps,
  config: ModeConfig
): Promise<void> {
  const { pool, markOnboarded } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await markOnboarded(userId);
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  await ctx.reply(`Отлично.\n\n${config.onboarding.intro}`);
}

export async function handleEngineOnboardDigestCtaLater(
  ctx: AppContext,
  deps: HandlerDeps,
  config: ModeConfig
): Promise<void> {
  const { pool, markOnboarded } = deps;
  const userId = ctx.userId;
  await ctx.answerCallbackQuery();
  await markOnboarded(userId);
  await pool.query('UPDATE users SET onboarding_completed_at = NOW() WHERE user_id = $1', [userId]);
  await ctx.reply(`Хорошо.\n\n${config.onboarding.intro}`);
}
