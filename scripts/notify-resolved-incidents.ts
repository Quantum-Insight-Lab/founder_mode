/**
 * После исправления сервисной ошибки: разослать пользователям текст из RESOLVED_INCIDENT_MESSAGE
 * и пометить открытые инциденты как resolved (notified_at).
 *
 * Env: DATABASE_URL, RESOLVED_INCIDENT_MESSAGE,
 *      BOT_TOKEN (если есть открытые инциденты telegram),
 *      MAX_BOT_TOKEN (если есть открытые инциденты max).
 */
import 'dotenv/config';
import { Pool } from 'pg';
import {
  listOpenIncidents,
  markIncidentsResolved,
} from '../src/services/service-error-incidents.js';
import { sendMaxMessage } from '../src/bot/transport/max-send.js';
import type { Channel } from '../src/bot/transport/types.js';
import { notifyAdminScriptCompleted } from '../src/observability/alert.js';

const SCRIPT_LABEL = 'notify-resolved (npm run notify-resolved)';

async function sendTelegramHtml(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram ${res.status}: ${body}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const message = process.env.RESOLVED_INCIDENT_MESSAGE?.trim();
  if (!message) throw new Error('RESOLVED_INCIDENT_MESSAGE is required');

  const botToken = process.env.BOT_TOKEN;
  const maxToken = process.env.MAX_BOT_TOKEN;

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const open = await listOpenIncidents(pool);
    if (open.length === 0) {
      console.log('No open service_error_incidents.');
      await notifyAdminScriptCompleted({
        scriptLabel: SCRIPT_LABEL,
        usersNotified: 0,
        messagesDelivered: 0,
        incidentsResolved: 0,
      });
      return;
    }

    const needsTg = open.some((r) => r.channel === 'telegram');
    const needsMax = open.some((r) => r.channel === 'max');
    if (needsTg && !botToken) throw new Error('Open telegram incidents but BOT_TOKEN is unset');
    if (needsMax && !maxToken) throw new Error('Open max incidents but MAX_BOT_TOKEN is unset');

    const groups = new Map<string, { userId: string; channel: Channel; ids: string[] }>();
    for (const row of open) {
      const key = `${row.user_id}:${row.channel}`;
      let g = groups.get(key);
      if (!g) {
        g = { userId: row.user_id, channel: row.channel, ids: [] };
        groups.set(key, g);
      }
      g.ids.push(row.id);
    }

    const toResolve: string[] = [];
    let messagesDelivered = 0;

    for (const { userId, channel, ids } of groups.values()) {
      const u = await pool.query<{ tg_id: string | null; max_id: string | null }>(
        'SELECT tg_id, max_id FROM users WHERE user_id = $1',
        [userId]
      );
      const row = u.rows[0];
      if (!row) {
        console.warn(`Skip incidents (no user): ${userId}`);
        continue;
      }

      try {
        if (channel === 'telegram') {
          const chatId = row.tg_id;
          if (!chatId) {
            console.warn(`Skip telegram incidents (no tg_id): ${userId}`);
            continue;
          }
          await sendTelegramHtml(botToken!, chatId, message);
        } else {
          const maxUserId = row.max_id;
          if (!maxUserId) {
            console.warn(`Skip max incidents (no max_id): ${userId}`);
            continue;
          }
          await sendMaxMessage(maxToken!, maxUserId, message, undefined, 'html');
        }
        toResolve.push(...ids);
        messagesDelivered += 1;
        console.log(`Notified ${channel} user ${userId} (${ids.length} incident(s))`);
      } catch (e) {
        console.error({ err: e, userId, channel }, 'Notify failed, leaving incidents open');
      }
    }

    let incidentsResolved = 0;
    if (toResolve.length > 0) {
      incidentsResolved = await markIncidentsResolved(pool, toResolve);
      console.log(`Marked ${incidentsResolved} incident(s) resolved.`);
    }

    await notifyAdminScriptCompleted({
      scriptLabel: SCRIPT_LABEL,
      usersNotified: messagesDelivered,
      messagesDelivered,
      incidentsResolved,
    });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
