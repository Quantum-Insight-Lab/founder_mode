/**
 * Developer alerts via Telegram
 */
import type { Api } from 'grammy';
import { InvariantViolationError } from '../domain/errors.js';
import { escapeHtml } from '../domain/html.js';
import { logger } from './logger.js';

const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID?.trim();

export function notifyDeveloper(
  api: Api,
  err: unknown,
  context: string,
  userId?: string
): void {
  if (!ALERT_CHAT_ID) return;
  if (err instanceof InvariantViolationError) return;

  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const body = stack ? `${escapeHtml(msg)}\n\n<code>${escapeHtml(stack.slice(0, 1500))}</code>` : escapeHtml(msg);

  const text = `🔴 [Founder Mode] Ошибка\n\nТип: ${context}\n${userId ? `User: ${userId}\n` : ''}\n${body}`;

  api
    .sendMessage(ALERT_CHAT_ID, text, { parse_mode: 'HTML' })
    .catch((e) => logger.error({ err: e, alertChatId: ALERT_CHAT_ID }, 'Alert send failed'));
}
