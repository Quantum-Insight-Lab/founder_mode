import type { Bot } from 'grammy';
import { randomUUID } from 'node:crypto';
import type { BotContext } from '../context.js';
import { InvariantViolationError } from '../../domain/errors.js';
import { invariantViolations } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { formatLlmResponse } from '../../domain/html.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { createEventStore } from '../../events/event-store.js';
import { EVENT_TYPES } from '../../events/types.js';
import { createProjectors } from '../../projectors/index.js';
import { createPlanService, getWeekId, getWeekStartEnd } from '../../services/plan-service.js';
import { createDeclarationService } from '../../services/declaration-service.js';
import { createReflectionService } from '../../services/reflection-service.js';
import { createReviewService } from '../../services/review-service.js';
import { createSettingsService, formatDay, formatDays, formatTime } from '../../services/settings-service.js';
import { createLLMClient } from '../../llm/client.js';
import { getPool, getUserByTgId, getUserByMaxId, markOnboarded, countRows } from '../../db/index.js';
import { initTokenSpikeChecker } from '../../observability/token-spike.js';
import {
  SETTINGS_NOTIFICATIONS,
  SETTINGS_PLAN,
  SETTINGS_REFLECT,
  SETTINGS_REVIEW,
  SETTINGS_TIMEZONE,
} from '../conversations.js';
import type { HandlerDeps } from './deps.js';
import { registerOnboardingHandlers } from './onboarding.js';
import { registerDeclarationHandlers } from './declaration.js';
import { registerPlanHandlers } from './plan.js';
import { registerReflectHandlers } from './reflect.js';
import { registerReviewHandlers } from './review.js';
import { registerSettingsHandlers } from './settings.js';
import { registerDeleteHandlers } from './delete.js';

const SERVICE_ERROR_FALLBACK = '❌ Сервисная ошибка зафиксирована и передана разработчику. Попробуйте позже.';

function formatErrorForUser(err: unknown): string {
  if (err instanceof InvariantViolationError) {
    invariantViolations.inc({ invariant_id: err.invariantId });
    logger.warn({ invariantId: err.invariantId, message: err.message }, 'Invariant violation');
    const msg = err.message;
    return msg.startsWith('❌') ? msg : `❌ ${msg}`;
  }
  return SERVICE_ERROR_FALLBACK;
}

/** Creates handler deps (including ensureUser) for use in index and registerHandlers. */
export function createAppDeps(): HandlerDeps {
  const pool = getPool();
  const eventStore = createEventStore(pool);
  const projectors = createProjectors(pool);
  const llm = createLLMClient();
  const serviceDeps = { pool, projectors, llm };
  const planService = createPlanService(eventStore, serviceDeps);
  const declarationService = createDeclarationService(eventStore, serviceDeps);
  const reflectionService = createReflectionService(eventStore, serviceDeps);
  const reviewService = createReviewService(eventStore, serviceDeps);
  const settingsService = createSettingsService(pool);

  async function ensureUser(channel: 'telegram' | 'max', externalId: string): Promise<string> {
    const col = channel === 'telegram' ? 'tg_id' : 'max_id';
    const row = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM users WHERE ${col} = $1 LIMIT 1`,
      [externalId]
    );
    if (row.rows.length > 0) return row.rows[0].user_id;

    const userId = randomUUID();
    const payload =
      channel === 'telegram'
        ? { user_id: userId, tg_id: externalId }
        : { user_id: userId, max_id: externalId };
    const appended = await eventStore.append({
      event_type: EVENT_TYPES.UserRegistered,
      actor: { id: userId, role: 'user' },
      subject: { entity: 'User', id: userId },
      payload,
      causation_id: null,
      correlation_id: null,
      idempotency_key: `user:${channel}:${externalId}`,
      schema_version: 1,
    });
    await projectors.handleEvent(appended);
    return userId;
  }

  async function getReflectDate(userId: string, choice: 'yesterday' | 'today'): Promise<string> {
    const todayStr = await getUserLocalDate(userId, pool);
    if (choice === 'today') return todayStr;
    const d = new Date(todayStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  async function handleLlmReply(
    ctx: import('../transport/types.js').AppContext,
    rawPost: string,
    userId: string,
    context: 'declaration' | 'plan' | 'reflect' | 'review'
  ): Promise<void> {
    const formatted = formatLlmResponse(rawPost?.trim() || '');
    if (!formatted) {
      logger.error({ userId }, `${context}: empty LLM response`);
      ctx.alertError?.(new Error('Empty LLM response'), context, userId);
    }
    await ctx.reply(formatted || SERVICE_ERROR_FALLBACK, { parse_mode: 'HTML' });
  }

  async function showSettingsMenu(
    ctx: import('../transport/types.js').AppContext,
    userId: string
  ): Promise<void> {
    const settings = await settingsService.getOrCreate(userId);
    const notif = settings.notifications_enabled ? 'Вкл' : 'Выкл';
    const planStr = settings.plan_notify_day != null
      ? `${formatDay(settings.plan_notify_day)} ${formatTime(settings.plan_notify_time)}`
      : '—';
    const reflectStr = settings.reflect_notify_days
      ? `${formatDays(settings.reflect_notify_days)} ${formatTime(settings.reflect_notify_time)}`
      : '—';
    const reviewStr = settings.review_notify_day != null
      ? `${formatDay(settings.review_notify_day)} ${formatTime(settings.review_notify_time)}`
      : '—';
    const tzStr = settings.timezone ?? '—';

    const text =
      `<b>${SETTINGS_NOTIFICATIONS}</b>: ${notif}\n` +
      `<b>${SETTINGS_PLAN}</b>: ${planStr}\n` +
      `<b>${SETTINGS_REFLECT}</b>: ${reflectStr}\n` +
      `<b>${SETTINGS_REVIEW}</b>: ${reviewStr}\n` +
      `<b>${SETTINGS_TIMEZONE}</b>: ${tzStr}`;

    const reply_markup: import('../transport/types.js').InlineButton[][] = [
      [
        {
          text: notif === 'Вкл' ? 'Выкл уведомления' : 'Вкл уведомления',
          callback_data: 'settings_notif_toggle',
        },
      ],
      [
        { text: 'План', callback_data: 'settings_plan' },
        { text: 'Рефлексия', callback_data: 'settings_reflect' },
        { text: 'Обзор', callback_data: 'settings_review' },
      ],
      [{ text: 'Таймзона', callback_data: 'settings_tz' }],
    ];
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
  }

  return {
    pool,
    getUserByTgId: (tgId) => getUserByTgId(pool, tgId),
    getUserByMaxId: (maxId) => getUserByMaxId(pool, maxId),
    markOnboarded: (userId) => markOnboarded(pool, userId),
    ensureUser,
    getReflectDate,
    formatErrorForUser,
    handleLlmReply,
    countRows,
    declarationService,
    planService,
    reflectionService,
    reviewService,
    settingsService,
    showSettingsMenu,
  };
}

export function registerHandlers(bot: Bot<BotContext>, deps: HandlerDeps) {
  initTokenSpikeChecker(deps.pool, bot.api);
  registerOnboardingHandlers(bot, deps);
  registerDeclarationHandlers(bot, deps);
  registerPlanHandlers(bot, deps);
  registerReflectHandlers(bot, deps);
  registerReviewHandlers(bot, deps);
  registerSettingsHandlers(bot, deps);
  registerDeleteHandlers(bot, deps);
}
