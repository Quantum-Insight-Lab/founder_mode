/**
 * MAX adapter: long polling GET /updates, build AppContext, dispatch to handlers.
 * Session key = internal user_id (from ensureUser('max', max_user_id)).
 */
import { logger } from '../../observability/logger.js';
import type { AppContext, IncomingEvent, ReplyOptions } from './types.js';
import type { SessionData } from '../context.js';
import { sendMaxImage, sendMaxMessage } from './max-send.js';
import { dispatch } from '../dispatch.js';
import type { HandlerDeps } from '../handlers/deps.js';
import { notifyDeveloperMax } from '../../observability/alert.js';

const MAX_UPDATES_URL = 'https://platform-api.max.ru/updates';
const MAX_API_BASE = 'https://platform-api.max.ru';

/** MAX API update (message_created, message_callback, bot_started). */
interface MaxUpdate {
  update_type?: string;
  timestamp?: number;
  marker?: number;
  message?: {
    sender?: { user_id?: number };
    recipient?: { user_id?: number; chat_id?: number };
    body?: { text?: string; attachments?: unknown[]; [k: string]: unknown };
    attachments?: unknown[];
    [k: string]: unknown;
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
    u.message?.sender?.user_id;
  if (uid != null) return String(uid);
  return null;
}

function getMessageText(u: MaxUpdate): string {
  return u.message?.body?.text ?? '';
}

function getMaxDisplayName(u: MaxUpdate, fallbackExternalId: string): string {
  const sender = u.message?.sender as Record<string, unknown> | undefined;
  if (sender) {
    const isBot = sender.is_bot === true;
    if (!isBot) {
      const first = typeof sender.first_name === 'string' ? sender.first_name.trim() : '';
      const last = typeof sender.last_name === 'string' ? sender.last_name.trim() : '';
      const full = [first, last].filter(Boolean).join(' ').trim();
      if (full) return full;
      if (typeof sender.name === 'string' && sender.name.trim()) return sender.name.trim();
    }
  }
  return fallbackExternalId;
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

function guessImageContentType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function toAbsoluteMaxUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${MAX_API_BASE}${url}`;
  return `${MAX_API_BASE}/${url}`;
}

function looksLikeImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('.png') ||
    lower.includes('.jpg') ||
    lower.includes('.jpeg') ||
    lower.includes('.webp') ||
    lower.includes('.gif')
  );
}

function tryGetImageAttachment(u: MaxUpdate): { url: string; mime: string; filename?: string } | null {
  const msg = (u.message ?? {}) as Record<string, unknown>;
  const body = (msg.body ?? {}) as Record<string, unknown>;
  const rootAttachments = (msg.attachments ?? []) as unknown[];
  const bodyAttachments = (body.attachments ?? []) as unknown[];
  const attachments = [...rootAttachments, ...bodyAttachments];
  for (const raw of attachments) {
    const a = raw as Record<string, unknown>;
    const payload = (a.payload ?? a.data ?? a.media ?? {}) as Record<string, unknown>;
    const candidateUrl =
      (typeof payload.url === 'string' && payload.url) ||
      (typeof payload.media_url === 'string' && payload.media_url) ||
      (typeof payload.download_url === 'string' && payload.download_url) ||
      (typeof payload.file_url === 'string' && payload.file_url) ||
      (typeof a.url === 'string' && a.url) ||
      (typeof a.media_url === 'string' && a.media_url) ||
      '';
    if (!candidateUrl) continue;
    const candidateMime =
      (typeof payload.mime_type === 'string' && payload.mime_type) ||
      (typeof payload.content_type === 'string' && payload.content_type) ||
      (typeof a.mime_type === 'string' && a.mime_type) ||
      (typeof a.content_type === 'string' && a.content_type) ||
      '';
    const mime = candidateMime.trim().toLowerCase();
    const type = ((typeof a.type === 'string' && a.type) || (typeof payload.type === 'string' && payload.type) || '')
      .trim()
      .toLowerCase();
    if (mime.startsWith('image/') || type.includes('image') || looksLikeImageUrl(candidateUrl)) {
      const filename =
        (typeof payload.file_name === 'string' && payload.file_name) ||
        (typeof a.file_name === 'string' && a.file_name) ||
        undefined;
      return {
        url: candidateUrl.trim(),
        mime: mime || guessImageContentType(candidateUrl.trim()),
        filename,
      };
    }
  }
  return null;
}

function extractAvatarUrl(u: MaxUpdate): string | null {
  const sender = (u.message?.sender ?? null) as Record<string, unknown> | null;
  const callbackUser = (u.callback?.user ?? null) as Record<string, unknown> | null;
  const topUser = (u.user ?? null) as Record<string, unknown> | null;
  const candidates: Array<Record<string, unknown> | null> = [sender, callbackUser, topUser];
  const keys = [
    'avatar_url',
    'avatarUrl',
    'photo_url',
    'photoUrl',
    'image_url',
    'imageUrl',
    'picture_url',
    'pictureUrl',
  ] as const;
  let avatarUrl: string | null = null;
  for (const source of candidates) {
    if (!source) continue;
    for (const key of keys) {
      const val = source[key];
      if (typeof val === 'string' && val.trim()) {
        avatarUrl = val.trim();
        break;
      }
    }
    if (avatarUrl) break;
  }
  return avatarUrl;
}

function buildMaxAppContext(
  userId: string,
  externalId: string,
  displayName: string,
  session: SessionData,
  token: string,
  sessionStore: { set(key: string, value: SessionData): void },
  avatarUrl: string | null,
  chatId: string | null
): AppContext {
  return {
    userId,
    channel: 'max',
    externalId,
    displayName,
    session,
    async reply(text: string, options?: ReplyOptions) {
      const format = options?.parse_mode === 'HTML' ? 'html' : undefined;
      await sendMaxMessage(token, externalId, text, options?.reply_markup, format);
    },
    async answerCallbackQuery() {
      // MAX may not require explicit answer; no-op for now
    },
    async replyImage(image: Buffer, filename: string, caption?: string, options?: ReplyOptions) {
      const format = options?.parse_mode === 'HTML' ? 'html' : undefined;
      await sendMaxImage(token, externalId, image, filename, caption, format);
    },
    async getAvatarDataUrl() {
      let resolvedAvatarUrl = avatarUrl;
      if (!resolvedAvatarUrl && chatId) {
        const membersUrl = `${MAX_API_BASE}/chats/${encodeURIComponent(chatId)}/members?user_ids=${encodeURIComponent(externalId)}&count=1`;
        try {
          const membersRes = await fetch(membersUrl, {
            method: 'GET',
            headers: { Authorization: token },
          });
          let payload: unknown = null;
          let errorText = '';
          if (membersRes.ok) {
            payload = await membersRes.json();
            const obj = payload as Record<string, unknown>;
            const users = (obj.members ?? obj.users ?? obj.items ?? []) as Array<Record<string, unknown>>;
            const first = users[0] ?? {};
            const candidate =
              (typeof first.full_avatar_url === 'string' && first.full_avatar_url) ||
              (typeof first.avatar_url === 'string' && first.avatar_url) ||
              '';
            if (candidate) resolvedAvatarUrl = candidate;
          } else {
            errorText = (await membersRes.text()).slice(0, 200);
          }

          if (!resolvedAvatarUrl) {
            const fallbackUrl = `${MAX_API_BASE}/chats/${encodeURIComponent(chatId)}/members?count=100`;
            const fallbackRes = await fetch(fallbackUrl, {
              method: 'GET',
              headers: { Authorization: token },
            });
            let fallbackErrorText = '';
            if (fallbackRes.ok) {
              const payload2 = (await fallbackRes.json()) as Record<string, unknown>;
              const users = (payload2.members ?? payload2.users ?? payload2.items ?? []) as Array<Record<string, unknown>>;
              const target = users.find((u) => String(u.user_id ?? '') === externalId) ?? users[0];
              const candidate =
                (typeof target?.full_avatar_url === 'string' && target.full_avatar_url) ||
                (typeof target?.avatar_url === 'string' && target.avatar_url) ||
                '';
              if (candidate) resolvedAvatarUrl = candidate;
            } else {
              fallbackErrorText = (await fallbackRes.text()).slice(0, 200);
            }
          }
        } catch {
          // probe failed
        }
      }
      if (!resolvedAvatarUrl) {
        const profileCandidates = [
          `${MAX_API_BASE}/users/${encodeURIComponent(externalId)}`,
          `${MAX_API_BASE}/users?user_ids=${encodeURIComponent(externalId)}`,
        ];
        for (const profileUrl of profileCandidates) {
          try {
            const profileRes = await fetch(profileUrl, {
              method: 'GET',
              headers: { Authorization: token },
            });
            let body: unknown = null;
            let errorText = '';
            if (profileRes.ok) {
              body = await profileRes.json();
              const obj = body as Record<string, unknown>;
              const arr = (obj.users ?? obj.items ?? []) as Array<Record<string, unknown>>;
              const first = (arr[0] ?? obj) as Record<string, unknown>;
              const candidate =
                (typeof first.full_avatar_url === 'string' && first.full_avatar_url) ||
                (typeof first.avatar_url === 'string' && first.avatar_url) ||
                '';
              if (candidate) resolvedAvatarUrl = candidate;
            } else {
              errorText = (await profileRes.text()).slice(0, 200);
            }
            if (resolvedAvatarUrl) break;
          } catch {
            // probe failed
          }
        }
      }
      if (!resolvedAvatarUrl) return null;
      const absoluteUrl = toAbsoluteMaxUrl(resolvedAvatarUrl);
      const tryFetch = async (withAuth: boolean): Promise<Response> =>
        fetch(absoluteUrl, {
          method: 'GET',
          headers: withAuth ? { Authorization: token } : undefined,
        });
      let res: Response;
      try {
        res = await tryFetch(true);
        if (!res.ok) {
          res = await tryFetch(false);
        }
      } catch {
        return null;
      }
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      const headerType = res.headers.get('content-type')?.split(';')[0] || '';
      const contentType = headerType.startsWith('image/') ? headerType : guessImageContentType(absoluteUrl);
      return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
    },
    alertError(err: unknown, context: string, uid?: string) {
      logger.error({ err, context, userId: uid }, 'MAX handler error');
      notifyDeveloperMax(err, context, uid);
    },
  };
}

function getCallbackPayload(u: MaxUpdate): string {
  const raw = u.payload ?? u.callback?.payload ?? (u.callback as { data?: string } | undefined)?.data ?? '';
  const s = typeof raw === 'string' ? raw : String(raw ?? '');
  return s;
}

async function updateToEvent(u: MaxUpdate, token: string): Promise<IncomingEvent | null> {
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
    const attachment = tryGetImageAttachment(u);
    if (attachment) {
      const absoluteUrl = toAbsoluteMaxUrl(attachment.url);
      const tryFetch = async (withAuth: boolean): Promise<Response> =>
        fetch(absoluteUrl, {
          method: 'GET',
          headers: withAuth ? { Authorization: token } : undefined,
        });
      try {
        let res = await tryFetch(true);
        if (!res.ok) res = await tryFetch(false);
        if (res.ok) {
          const bytes = Buffer.from(await res.arrayBuffer());
          const headerType = res.headers.get('content-type')?.split(';')[0] || '';
          const mime = headerType.startsWith('image/') ? headerType : attachment.mime;
          return { type: 'photo', bytes, mime, filename: attachment.filename };
        }
      } catch {
        // ignore image fetch failures and fall back to text event
      }
    }
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
      const displayName = getMaxDisplayName(u, maxUserId);
      const avatarUrl = extractAvatarUrl(u);
      const chatId = u.message?.recipient?.chat_id != null ? String(u.message.recipient.chat_id) : null;
      logger.debug(
        {
          maxUserId,
          userId: internalUserId,
          hasAvatarUrl: Boolean(avatarUrl),
          avatarUrlPrefix: avatarUrl?.slice(0, 80) ?? '',
          chatId: chatId ?? '',
          updateType: u.update_type,
        },
        'MAX avatar extraction'
      );
      const ctx = buildMaxAppContext(internalUserId, maxUserId, displayName, session, token, sessionStore, avatarUrl, chatId);

      const event = await updateToEvent(u, token);
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
