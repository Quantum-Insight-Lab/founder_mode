/**
 * Token usage spike alert
 */
import type { Api } from 'grammy';
import type { Pool } from 'pg';
import { config } from '../config/index.js';
import { notifyDeveloper, notifyDeveloperMax } from './alert.js';
import { logger } from './logger.js';

let poolRef: Pool | null = null;
let apiRef: Api | null = null;
let lastAlertAt = 0;
const COOLDOWN_MS = 30 * 60 * 1000;

export function initTokenSpikeChecker(pool: Pool, api: Api): void {
  poolRef = pool;
  apiRef = api;
}

export async function checkTokenSpike(): Promise<void> {
  if (!poolRef || !apiRef) return;
  // At least one alert channel must be configured.
  const hasTelegram = !!process.env.ALERT_CHAT_ID?.trim();
  const hasMax = !!process.env.MAX_BOT_TOKEN?.trim() && !!process.env.MAX_ALERT_USER_ID?.trim();
  if (!hasTelegram && !hasMax) return;
  if (Date.now() - lastAlertAt < COOLDOWN_MS) return;

  const { token_spike_threshold: threshold, token_spike_window_minutes: windowMinutes } =
    config().observability;

  try {
    const result = await poolRef.query<{ total: string }>(
      `SELECT COALESCE(SUM(tokens_in + tokens_out), 0)::bigint AS total
       FROM llm_calls WHERE created_at > NOW() - ($1 || ' minutes')::interval`,
      [String(windowMinutes)]
    );
    const total = parseInt(result.rows[0]?.total ?? '0', 10);
    if (total > threshold) {
      lastAlertAt = Date.now();
      const err = new Error(
        `Резкий рост токенов: ${total.toLocaleString()} за последние ${windowMinutes} мин (порог ${threshold.toLocaleString()})`
      );
      if (hasTelegram) notifyDeveloper(apiRef, err, 'token_spike');
      if (hasMax) notifyDeveloperMax(err, 'token_spike');
      logger.warn({ total, threshold, windowMinutes }, 'Token spike alert sent');
    }
  } catch (e) {
    logger.error({ err: e }, 'Token spike check failed');
  }
}
