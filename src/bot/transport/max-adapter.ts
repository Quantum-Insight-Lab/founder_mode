/**
 * MAX adapter: long polling GET /updates, build AppContext, dispatch to handlers.
 * Session key = internal user_id (from ensureUser('max', max_user_id)).
 */
import { logger } from '../../observability/logger.js';
import type { AppContext, IncomingEvent, ReplyOptions } from './types.js';
import type { SessionData } from '../context.js';
import { sendMaxMessage } from './max-send.js';
import { dispatch } from '../dispatch.js';
import type { HandlerDeps } from '../handlers/deps.js';

const MAX_UPDATES_URL = 'https://platform-api.max.ru/updates';

/** MAX API update (message_created, message_callback, bot_started). */
interface MaxUpdate {
  update_type?: string;
  timestamp?: number;
  marker?: number;
  message?: {
    sender?: { user_id?: number };
    recipient?: { user_id?: number };
    body?: { text?: string };
  };
  /** message_callback: button payload (top-level or inside callback) */
  payload?: string;
  /** alternative: callback object (payload or data) */
  callback?: { payload?: string; data?: string; user_id?: number; user?: { user_id?: number }; [k: string]: unknown };
  /** some APIs put user_id at top level; bot_started may have user here */
  user_id?: number;
  /** bot_started: user who clicked "Начать" */
  user?: { user_id?: number };
}

interface MaxUpdatesResponse {
  updates?: MaxUpdate[];
  marker?: number | null;
}

function getMaxUserId(u: MaxUpdate): string | null {
  const uid =
    u.user_id ??
    u.user?.user_id ??
    (u.callback as { user_id?: number; user?: { user_id?: number } } | undefined)?.user_id ??
    (u.callback as { user?: { user_id?: number } } | undefined)?.user?.user_id ??
    u.message?.sender?.user_id ??
    u.message?.recipient?.user_id;
  if (uid != null) return String(uid);
  return null;
}

function getMessageText(u: MaxUpdate): string {
  return u.message?.body?.text ?? '';
}

function parseCommand(text: string): { name: string; rest: string } | null {
  const t = text.trim();
  if (!t.startsWith('/')) return null;
  const space = t.indexOf(' ');
  const raw = space === -1 ? t.slice(1) : t.slice(1, space);
  const name = raw.split('@')[0];
  const rest = space === -1 ? '' : t.slice(space + 1).trim();
  return { name, rest };
}

function buildMaxAppContext(
  userId: string,
  externalId: string,
  session: SessionData,
  token: string,
  sessionStore: { set(key: string, value: SessionData): void }
): AppContext {
  return {
    userId,
    channel: 'max',
    externalId,
    session,
    async reply(text: string, options?: ReplyOptions) {
      const format = options?.parse_mode === 'HTML' ? 'html' : undefined;
      await sendMaxMessage(token, externalId, text, options?.reply_markup, format);
    },
    async answerCallbackQuery() {
      // MAX may not require explicit answer; no-op for now
    },
    alertError(err: unknown, context: string, uid?: string) {
      logger.error({ err, context, userId: uid }, 'MAX handler error');
    },
  };
}

function getCallbackPayload(u: MaxUpdate): string {
  const raw = u.payload ?? u.callback?.payload ?? (u.callback as { data?: string } | undefined)?.data ?? '';
  const s = typeof raw === 'string' ? raw : String(raw ?? '');
  return s;
}

function updateToEvent(u: MaxUpdate): IncomingEvent | null {
  const type = u.update_type;
  if (type === 'bot_started') {
    return { type: 'command', name: 'start' };
  }
  if (type === 'message_callback') {
    const payload = getCallbackPayload(u);
    if (!payload) {
      logger.info({ updateKeys: Object.keys(u), callbackKeys: u.callback ? Object.keys(u.callback) : [] }, 'MAX message_callback: empty payload, check update structure');
    }
    return { type: 'callback', data: payload };
  }
  if (type === 'message_created') {
    const text = getMessageText(u);
    const cmd = parseCommand(text);
    if (cmd) return { type: 'command', name: cmd.name };
    return { type: 'message', text };
  }
  return null;
}

export type SessionStore = { get(key: string): SessionData | undefined; set(key: string, value: SessionData): void };

/**
 * Run long polling for MAX; for each update: ensureUser, load session, dispatch, save session.
 * Does not return; run in background.
 */
export function runMaxPolling(
  token: string,
  sessionStore: SessionStore,
  deps: HandlerDeps
): void {
  let marker: number | null = null;

  async function poll(): Promise<void> {
    const url = new URL(MAX_UPDATES_URL);
    url.searchParams.set('timeout', '25');
    url.searchParams.set('types', 'message_created,message_callback,bot_started');
    if (marker != null) url.searchParams.set('marker', String(marker));

    // MAX long poll holds connection up to 25s; allow 35s so response isn't cut by default fetch timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35_000);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: token },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      logger.warn({ err }, 'MAX polling fetch error');
      setTimeout(poll, 5000);
      return;
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
      logger.warn({ status: res.status }, 'MAX updates error');
      setTimeout(poll, 5000);
      return;
    }

    let body: MaxUpdatesResponse;
    try {
      body = (await res.json()) as MaxUpdatesResponse;
    } catch (err) {
      logger.warn({ err }, 'MAX updates JSON parse error');
      setTimeout(poll, 1000);
      return;
    }

    if (body.marker != null) marker = body.marker;
    const updates = body.updates ?? [];
    if (updates.length > 0) {
      logger.debug({ count: updates.length, marker: body.marker ?? undefined }, 'MAX updates received');
    }

    for (const u of updates) {
      const maxUserId = getMaxUserId(u);
      if (!maxUserId) {
        logger.debug({ update_type: u.update_type }, 'MAX update skipped: no user_id');
        continue;
      }

      let internalUserId: string;
      try {
        internalUserId = await deps.ensureUser('max', maxUserId);
      } catch (err) {
        logger.error({ err, maxUserId }, 'MAX ensureUser failed');
        continue;
      }

      const session = sessionStore.get(internalUserId) ?? {};
      const ctx = buildMaxAppContext(internalUserId, maxUserId, session, token, sessionStore);

      const event = updateToEvent(u);
      if (!event) {
        logger.debug({ maxUserId, update_type: u.update_type }, 'MAX update skipped: unknown event type');
        continue;
      }

      logger.info({ maxUserId, userId: internalUserId, eventType: event.type, ...(event.type === 'command' ? { command: event.name } : event.type === 'callback' ? { callback: event.data } : { step: ctx.session?.step }) }, 'MAX update handled');
      try {
        await dispatch(ctx, event, deps);
      } catch (err) {
        logger.error({ err, userId: internalUserId }, 'MAX dispatch error');
        try {
          await ctx.reply(deps.formatErrorForUser(err));
        } catch (_) {}
      }

      sessionStore.set(internalUserId, ctx.session);
    }

    setTimeout(poll, 0);
  }

  logger.info('MAX long polling started');
  logger.debug('MAX polling loop: GET /updates, timeout=25s, types=message_created,message_callback,bot_started');
  poll();
}
