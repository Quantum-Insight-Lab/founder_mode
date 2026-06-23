import type { Bot } from 'grammy';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { BotContext } from '../context.js';
import { InvariantViolationError } from '../../domain/errors.js';
import { invariantViolations } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { escapeHtml } from '../../domain/html.js';
import { getUserLocalDate } from '../../db/user-timezone.js';
import { createEventStore } from '../../events/event-store.js';
import { EVENT_TYPES } from '../../events/types.js';
import { createProjectors } from '../../projectors/index.js';
import { createDeclarationService } from '../../services/declaration-service.js';
import { createReportService } from '../../services/report-service.js';
import { createPriorityChangeService } from '../../services/priority-change-service.js';
import { createFixationService } from '../../services/fixation-service.js';
import { createMatterService } from '../../services/matter-service.js';
import { createMatterSwitchService } from '../../services/matter-switch-service.js';
import { createStepService } from '../../services/step-service.js';
import { createDigestService } from '../../services/digest-service.js';
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
import { isEngineMode, productModeLabel } from '../../services/product-mode.js';
import { getModeConfig } from '../../modes/registry.js';
import { SETTINGS_PRODUCT_MODE } from '../product-mode-copy.js';
import { registerProductModeHandlers } from './product-mode.js';
import { registerEngineHandlers } from './engine/index.js';
import { createEngineServices } from '../../services/engine/index.js';
import { registerOnboardingHandlers } from './onboarding.js';
import { registerDeclarationHandlers } from './declaration.js';
import { registerReportHandlers } from './report.js';
import { registerChangeHandlers } from './change.js';
import { registerFixationHandlers } from './fixation.js';
import { registerSettingsHandlers } from './settings.js';
import { registerDeleteHandlers } from './delete.js';
import type { HandlerDeps } from './deps.js';
import { formatUserFacingError, USER_SERVICE_ERROR_FALLBACK } from '../user-facing-error.js';
import { recordServiceErrorIncident } from '../../services/service-error-incidents.js';

let defaultAvatarPngDataUrl: string | null = null;
async function ensureDefaultAvatarDataUrl(): Promise<string> {
  if (!defaultAvatarPngDataUrl) {
    const buf = await readFile(path.join(process.cwd(), 'design', 'assets', 'default_avatar.png'));
    const out = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize(180, 180, { fit: 'cover', position: 'centre' })
      .webp({ quality: 92 })
      .toBuffer();
    defaultAvatarPngDataUrl = `data:image/webp;base64,${out.toString('base64')}`;
  }
  return defaultAvatarPngDataUrl;
}

async function normalizeAvatarDataUrl180(dataUrl: string): Promise<string | null> {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  try {
    const out = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize(180, 180, { fit: 'cover', position: 'centre' })
      .webp({ quality: 92 })
      .toBuffer();
    return `data:image/webp;base64,${out.toString('base64')}`;
  } catch {
    return null;
  }
}

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
  const priorityChangeService = createPriorityChangeService(eventStore, serviceDeps);
  const fixationService = createFixationService(eventStore, serviceDeps);
  const matterService = createMatterService(eventStore, serviceDeps);
  const matterSwitchService = createMatterSwitchService(eventStore, serviceDeps);
  const stepService = createStepService(eventStore, serviceDeps);
  const digestService = createDigestService(eventStore, serviceDeps);
  const engineServices = createEngineServices(eventStore, serviceDeps);
  const settingsService = createSettingsService(pool);

  async function replyWithServiceError(
    ctx: import('../transport/types.js').AppContext,
    err: unknown,
    userId: string,
    context: string
  ): Promise<void> {
    await recordServiceErrorIncident(pool, { userId, channel: ctx.channel, context, err });
    await ctx.reply(formatErrorForUser(err), { parse_mode: 'HTML' });
  }

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
    context: 'declaration' | 'fixation' | 'report' | 'change' | 'matter' | 'step' | 'digest' | 'switch'
  ): Promise<void> {
    const trimmed = rawPost?.trim() || '';
    const formatted = escapeHtml(trimmed);
    if (!formatted) {
      logger.error({ userId }, `${context}: empty LLM response`);
      ctx.alertError?.(new Error('Empty LLM response'), context, userId);
      await recordServiceErrorIncident(pool, {
        userId,
        channel: ctx.channel,
        context: `${context}:empty_llm`,
        err: new Error('Empty LLM response'),
      });
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

    const mode = await settingsService.getProductMode(userId);
    const engine = isEngineMode(mode);
    const engineConfig = engine ? getModeConfig(mode) : null;
    const lblNotif = SETTINGS_NOTIFICATIONS;
    const lblDecl = engine ? engineConfig!.settings.commitLabel : SETTINGS_DECLARATION;
    const lblFix = engine ? engineConfig!.settings.dailyLabel : SETTINGS_FIXATION;
    const lblReport = engine ? engineConfig!.settings.digestLabel : SETTINGS_REPORT;
    const lblTz = SETTINGS_TIMEZONE;
    const lblAvatar = SETTINGS_AVATAR;
    const lblConfigure = SETTINGS_CONFIGURE_NOTIFICATIONS;

    const text =
      `<b>${SETTINGS_PRODUCT_MODE}</b>: ${productModeLabel(mode)}\n` +
      `<b>${lblNotif}</b>: ${notif}\n` +
      `<b>${lblDecl}</b>: ${declarationStr}\n` +
      `<b>${lblFix}</b>: ${reflectStr}\n` +
      `<b>${lblReport}</b>: ${reportStr}\n` +
      `<b>${lblTz}</b>: ${tzStr}\n` +
      `<b>${lblAvatar}</b>: ${avatarStr}`;

    const reply_markup: import('../transport/types.js').InlineButton[][] = [
      [{ text: 'Сменить режим', callback_data: 'settings_product_mode' }],
      [{ text: lblConfigure, callback_data: 'settings_notifications' }],
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

    const mode = await settingsService.getProductMode(userId);
    const engine = isEngineMode(mode);
    const engineConfig = engine ? getModeConfig(mode) : null;
    const lblNotif = SETTINGS_NOTIFICATIONS;
    const lblDecl = engine ? engineConfig!.settings.commitLabel : SETTINGS_DECLARATION;
    const lblFix = engine ? engineConfig!.settings.dailyLabel : SETTINGS_FIXATION;
    const lblReport = engine ? engineConfig!.settings.digestLabel : SETTINGS_REPORT;

    const text =
      `<b>${lblNotif}</b>: ${notif}\n` +
      `<b>${lblDecl}</b>: ${declarationStr}\n` +
      `<b>${lblFix}</b>: ${reflectStr}\n` +
      `<b>${lblReport}</b>: ${reportStr}`;

    const reply_markup: import('../transport/types.js').InlineButton[][] = [
      [
        {
          text: notif === 'Вкл' ? 'Выкл напоминания' : 'Вкл напоминания',
          callback_data: 'settings_notif_toggle',
        },
      ],
      [
        { text: engine ? engineConfig!.settings.commitLabel : 'Приоритет', callback_data: 'settings_declaration' },
        { text: engine ? engineConfig!.settings.dailyLabel : 'Фиксация', callback_data: 'settings_fixation' },
        { text: engine ? engineConfig!.settings.digestLabel : 'Отчёт', callback_data: 'settings_report' },
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
    const bg = await resolveAvatarBackgroundImageValue(pref, {
      loadUploaded: loadAvatarDataUrl,
      loadMessenger: async () => {
        const raw = (await ctx.getAvatarDataUrl?.()) ?? null;
        if (!raw) return null;
        return (await normalizeAvatarDataUrl180(raw)) ?? raw;
      },
    });
    if (bg !== 'none') return bg;
    const dataUrl = await ensureDefaultAvatarDataUrl();
    const out = `url(${dataUrl})`;
    return out;
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
    replyWithServiceError,
    handleLlmReply,
    countRows,
    declarationService,
    reportService,
    priorityChangeService,
    fixationService,
    matterService,
    matterSwitchService,
    stepService,
    digestService,
    engineServices,
    settingsService,
    showSettingsMenu,
    showNotificationsSettingsMenu,
    saveUploadedAvatar,
    resolveAvatarBackgroundImage,
    getRhythmLineForCard,
    getUserProductMode: (userId) => settingsService.getProductMode(userId),
    setUserProductMode: (userId, mode) => settingsService.setProductMode(userId, mode),
  };
}

export function registerHandlers(bot: Bot<BotContext>, deps: HandlerDeps) {
  initTokenSpikeChecker(deps.pool, bot.api);
  registerProductModeHandlers(bot, deps);
  registerOnboardingHandlers(bot, deps);
  registerDeclarationHandlers(bot, deps);
  registerChangeHandlers(bot, deps);
  registerReportHandlers(bot, deps);
  registerFixationHandlers(bot, deps);
  registerEngineHandlers(bot, deps);
  registerSettingsHandlers(bot, deps);
  registerDeleteHandlers(bot, deps);
}