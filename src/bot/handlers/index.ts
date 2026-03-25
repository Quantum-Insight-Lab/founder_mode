import type { Bot } from 'grammy';
import { randomUUID } from 'node:crypto';
import type { BotContext } from '../context.js';
import { InvariantViolationError } from '../../domain/errors.js';
import { invariantViolations } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { escapeHtml, formatLlmResponse } from '../../domain/html.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { createEventStore } from '../../events/event-store.js';
import { EVENT_TYPES } from '../../events/types.js';
import { createProjectors } from '../../projectors/index.js';
import { createDeclarationService } from '../../services/declaration-service.js';
import { createReportService } from '../../services/report-service.js';
import { createFixationService } from '../../services/fixation-service.js';
import { createSettingsService, formatDay, formatDays, formatTime } from '../../services/settings-service.js';
import { loadAvatarDataUrl, storeNormalizedAvatar } from '../../services/avatar-storage.js';
import { resolveAvatarBackgroundImageValue } from '../../services/avatar-resolver.js';
import { getRhythmLineForCard as fetchRhythmLineForCard } from '../../services/rhythm-card.js';
import { createLLMClient } from '../../llm/client.js';
import { getPool, getUserByTgId, getUserByMaxId, markOnboarded, countRows } from '../../db/index.js';
import { initTokenSpikeChecker } from '../../observability/token-spike.js';
import {
  SETTINGS_NOTIFICATIONS,
  SETTINGS_DECLARATION,
  SETTINGS_FIXATION,
  SETTINGS_REPORT,
  SETTINGS_TIMEZONE,
  SETTINGS_AVATAR,
  SETTINGS_CONFIGURE_NOTIFICATIONS,
} from '../conversations.js';
import type { HandlerDeps } from './deps.js';
import { registerOnboardingHandlers } from './onboarding.js';
import { registerDeclarationHandlers } from './declaration.js';
import { registerReportHandlers } from './report.js';
import { registerFixationHandlers } from './fixation.js';
import { registerSettingsHandlers } from './settings.js';
import { registerDeleteHandlers } from './delete.js';
import { formatUserFacingError, USER_SERVICE_ERROR_FALLBACK } from '../user-facing-error.js';

function formatErrorForUser(err: unknown): string {
  if (err instanceof InvariantViolationError) {
    invariantViolations.inc({ invariant_id: err.invariantId });
    logger.warn({ invariantId: err.invariantId, message: err.message }, 'Invariant violation');
  }
  return formatUserFacingError(err);
}

/** Creates handler deps (including ensureUser) for use in index and registerHandlers. */
export function createAppDeps(): HandlerDeps {
  const pool = getPool();
  const eventStore = createEventStore(pool);
  const projectors = createProjectors(pool);
  const llm = createLLMClient();
  const serviceDeps = { pool, projectors, llm };
  const declarationService = createDeclarationService(eventStore, serviceDeps);
  const reportService = createReportService(eventStore, serviceDeps);
  const fixationService = createFixationService(eventStore, serviceDeps);
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

  async function getFixationDate(userId: string, choice: 'yesterday' | 'today'): Promise<string> {
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
    context: 'declaration' | 'fixation' | 'report'
  ): Promise<void> {
    const trimmed = rawPost?.trim() || '';
    const formatted = context === 'fixation' ? escapeHtml(trimmed) : formatLlmResponse(trimmed);
    if (!formatted) {
      logger.error({ userId }, `${context}: empty LLM response`);
      ctx.alertError?.(new Error('Empty LLM response'), context, userId);
    }
    await ctx.reply(formatted || USER_SERVICE_ERROR_FALLBACK, { parse_mode: 'HTML' });
  }

  async function showSettingsMenu(
    ctx: import('../transport/types.js').AppContext,
    userId: string
  ): Promise<void> {
    const settings = await settingsService.getOrCreate(userId);
    const notif = settings.notifications_enabled ? 'Вкл' : 'Выкл';
    const declarationStr = settings.declaration_notify_day != null
      ? `${formatDay(settings.declaration_notify_day)} ${formatTime(settings.declaration_notify_time)}`
      : '—';
    const reflectStr = settings.fixation_notify_days
      ? `${formatDays(settings.fixation_notify_days)} ${formatTime(settings.fixation_notify_time)}`
      : '—';
    const reportStr = settings.report_notify_day != null
      ? `${formatDay(settings.report_notify_day)} ${formatTime(settings.report_notify_time)}`
      : '—';
    const tzStr = settings.timezone ?? '—';
    const avatarStr =
      settings.avatar_mode === 'uploaded'
        ? 'Загружен'
        : settings.avatar_mode === 'messenger'
          ? 'Из мессенджера'
          : 'Стандартный';

    const text =
      `<b>${SETTINGS_NOTIFICATIONS}</b>: ${notif}\n` +
      `<b>${SETTINGS_DECLARATION}</b>: ${declarationStr}\n` +
      `<b>${SETTINGS_FIXATION}</b>: ${reflectStr}\n` +
      `<b>${SETTINGS_REPORT}</b>: ${reportStr}\n` +
      `<b>${SETTINGS_TIMEZONE}</b>: ${tzStr}\n` +
      `<b>${SETTINGS_AVATAR}</b>: ${avatarStr}`;

    const reply_markup: import('../transport/types.js').InlineButton[][] = [
      [{ text: SETTINGS_CONFIGURE_NOTIFICATIONS, callback_data: 'settings_notifications' }],
      [{ text: 'Настроить аватар', callback_data: 'settings_avatar' }],
      [{ text: 'Часовой пояс', callback_data: 'settings_tz' }],
    ];
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
  }

  async function showNotificationsSettingsMenu(
    ctx: import('../transport/types.js').AppContext,
    userId: string
  ): Promise<void> {
    const settings = await settingsService.getOrCreate(userId);
    const notif = settings.notifications_enabled ? 'Вкл' : 'Выкл';
    const declarationStr = settings.declaration_notify_day != null
      ? `${formatDay(settings.declaration_notify_day)} ${formatTime(settings.declaration_notify_time)}`
      : '—';
    const reflectStr = settings.fixation_notify_days
      ? `${formatDays(settings.fixation_notify_days)} ${formatTime(settings.fixation_notify_time)}`
      : '—';
    const reportStr = settings.report_notify_day != null
      ? `${formatDay(settings.report_notify_day)} ${formatTime(settings.report_notify_time)}`
      : '—';

    const text =
      `<b>${SETTINGS_NOTIFICATIONS}</b>: ${notif}\n` +
      `<b>${SETTINGS_DECLARATION}</b>: ${declarationStr}\n` +
      `<b>${SETTINGS_FIXATION}</b>: ${reflectStr}\n` +
      `<b>${SETTINGS_REPORT}</b>: ${reportStr}`;

    const reply_markup: import('../transport/types.js').InlineButton[][] = [
      [
        {
          text: notif === 'Вкл' ? 'Выкл уведомления' : 'Вкл уведомления',
          callback_data: 'settings_notif_toggle',
        },
      ],
      [
        { text: 'Приоритет', callback_data: 'settings_declaration' },
        { text: 'Фиксация', callback_data: 'settings_fixation' },
        { text: 'Отчёт', callback_data: 'settings_report' },
      ],
      [{ text: 'Назад', callback_data: 'settings_notifications_back' }],
    ];
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
  }

  async function saveUploadedAvatar(userId: string, bytes: Buffer, mime?: string | null): Promise<void> {
    const before = await settingsService.getOrCreate(userId);
    const stored = await storeNormalizedAvatar(userId, bytes, mime);
    await settingsService.setAvatarUploaded(userId, {
      storageKey: stored.storageKey,
      mime: stored.mime,
      width: stored.width,
      height: stored.height,
    });
    logger.info(
      { userId, prevStorageKey: before.avatar_storage_key, storageKey: stored.storageKey },
      'Avatar uploaded'
    );
  }

  async function resolveAvatarBackgroundImage(
    ctx: import('../transport/types.js').AppContext,
    userId: string
  ): Promise<string> {
    const pref = await settingsService.getAvatarPreference(userId);
    return resolveAvatarBackgroundImageValue(pref, {
      loadUploaded: loadAvatarDataUrl,
      loadMessenger: async () => (await ctx.getAvatarDataUrl?.()) ?? null,
    });
  }

  async function getRhythmLineForCard(userId: string): Promise<string | null> {
    const today = await getUserLocalDate(userId, pool);
    return fetchRhythmLineForCard(pool, userId, today);
  }

  return {
    pool,
    getUserByTgId: (tgId) => getUserByTgId(pool, tgId),
    getUserByMaxId: (maxId) => getUserByMaxId(pool, maxId),
    markOnboarded: (userId) => markOnboarded(pool, userId),
    ensureUser,
    getFixationDate,
    formatErrorForUser,
    handleLlmReply,
    countRows,
    declarationService,
    reportService,
    fixationService,
    settingsService,
    showSettingsMenu,
    showNotificationsSettingsMenu,
    saveUploadedAvatar,
    resolveAvatarBackgroundImage,
    getRhythmLineForCard,
  };
}

export function registerHandlers(bot: Bot<BotContext>, deps: HandlerDeps) {
  initTokenSpikeChecker(deps.pool, bot.api);
  registerOnboardingHandlers(bot, deps);
  registerDeclarationHandlers(bot, deps);
  registerReportHandlers(bot, deps);
  registerFixationHandlers(bot, deps);
  registerSettingsHandlers(bot, deps);
  registerDeleteHandlers(bot, deps);
}