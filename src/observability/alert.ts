/**
 * Developer alerts via Telegram / MAX
 */
import type { Api } from 'grammy';
import { sendMaxMessage } from '../bot/transport/max-send.js';
import { InvariantViolationError } from '../domain/errors.js';
import { escapeHtml } from '../domain/html.js';
import { logger } from './logger.js';

const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID?.trim();
const MAX_ALERT_USER_ID = process.env.MAX_ALERT_USER_ID?.trim();
const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN?.trim();

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

export function notifyDeveloperMax(err: unknown, context: string, userId?: string): void {
  if (!MAX_ALERT_USER_ID || !MAX_BOT_TOKEN) return;
  if (err instanceof InvariantViolationError) return;

  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const body = stack ? `${escapeHtml(msg)}\n\n<code>${escapeHtml(stack.slice(0, 1500))}</code>` : escapeHtml(msg);
  const text = `🔴 [Founder Mode] Ошибка\n\nТип: ${context}\n${userId ? `User: ${userId}\n` : ''}\n${body}`;

  // MAX supports HTML format in our sender.
  sendMaxMessage(MAX_BOT_TOKEN, MAX_ALERT_USER_ID, text, undefined, 'html').catch((e) =>
    logger.error({ err: e, maxAlertUserId: MAX_ALERT_USER_ID }, 'MAX alert send failed')
  );
}

/** Итог работы скрипта (например notify-resolved) в ALERT_CHAT_ID / MAX_ALERT_USER_ID. */
export async function notifyAdminScriptCompleted(params: {
  scriptLabel: string;
  usersNotified: number;
  messagesDelivered: number;
  incidentsResolved?: number;
}): Promise<void> {
  const { scriptLabel, usersNotified, messagesDelivered, incidentsResolved } = params;
  const parts = [
    '🟢 [Founder Mode] Скрипт отработал',
    '',
    `Скрипт: ${escapeHtml(scriptLabel)}`,
    `Пользователей уведомлено: ${usersNotified}`,
    `Сообщений доставлено: ${messagesDelivered}`,
  ];
  if (incidentsResolved !== undefined) {
    parts.push(`Инцидентов закрыто: ${incidentsResolved}`);
  }
  const text = parts.join('\n');

  const botToken = process.env.BOT_TOKEN?.trim();
  if (ALERT_CHAT_ID && botToken) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ALERT_CHAT_ID, text, parse_mode: 'HTML' }),
      });
      if (!res.ok) {
        const body = await res.text();
        logger.error({ status: res.status, body }, 'Admin script summary (Telegram) failed');
      }
    } catch (e) {
      logger.error({ err: e }, 'Admin script summary (Telegram) failed');
    }
  }

  if (MAX_ALERT_USER_ID && MAX_BOT_TOKEN) {
    try {
      await sendMaxMessage(MAX_BOT_TOKEN, MAX_ALERT_USER_ID, text, undefined, 'html');
    } catch (e) {
      logger.error({ err: e, maxAlertUserId: MAX_ALERT_USER_ID }, 'Admin script summary (MAX) failed');
    }
  }
}
