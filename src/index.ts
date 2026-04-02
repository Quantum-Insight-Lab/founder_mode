import 'dotenv/config';
import http from 'http';
import { Bot, session } from 'grammy';
import { logger } from './observability/logger.js';
import { register } from './observability/metrics.js';
import { runWithNewTrace } from './observability/trace.js';
import type { BotContext, SessionData } from './bot/context.js';
import { createAppDeps, registerHandlers } from './bot/handlers/index.js';
import { userIdMiddleware } from './bot/transport/user-id-middleware.js';
import { createSessionStore, createGrammySessionStorage } from './bot/transport/session-store.js';
import { toGrammyInlineKeyboard } from './bot/transport/telegram-adapter.js';
import { notifyDeveloper } from './observability/alert.js';
import { botCatchErrorForLog } from './observability/bot-error-log.js';
import { notifySystemdReady, startSystemdWatchdogLoop } from './observability/systemd.js';
import { getPool } from './db/index.js';
import { initNotificationScheduler } from './scheduler/notifications.js';
import { sendMaxMessage } from './bot/transport/max-send.js';
import { runMaxPolling } from './bot/transport/max-adapter.js';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const METRICS_PORT = parseInt(process.env.METRICS_PORT ?? '9090', 10);

const bot = new Bot<BotContext>(token);
const deps = createAppDeps();
const sessionStore = createSessionStore();

bot.use((_ctx, next) => runWithNewTrace(() => next()));
bot.use(userIdMiddleware(deps.ensureUser));
bot.use(
  session({
    initial: (): SessionData => ({}),
    getSessionKey: (ctx) => (ctx as BotContext & { userId?: string }).userId?.toString(),
    storage: createGrammySessionStorage(sessionStore),
  })
);

registerHandlers(bot, deps);

bot.catch((err: { ctx?: { api: unknown; from?: { id?: number } }; error?: unknown }) => {
  logger.error(botCatchErrorForLog(err), 'Bot error');
  const api = err?.ctx?.api;
  const userId = err?.ctx?.from?.id?.toString();
  if (api) notifyDeveloper(api as import('grammy').Api, err.error ?? err, 'unhandled', userId);
});

const metricsServer = http.createServer(async (req, res) => {
  const url = req.url?.split('?')[0];

  if (url === '/metrics') {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
    return;
  }

  if (url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (url === '/health/ready') {
    res.setHeader('Content-Type', 'application/json');
    try {
      await getPool().query('SELECT 1');
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'ok', db: 'ok' }));
    } catch (err) {
      res.statusCode = 503;
      res.end(JSON.stringify({ status: 'degraded', db: 'error', error: (err as Error).message }));
    }
    return;
  }

  res.statusCode = 404;
  res.end();
});

bot.start({
  onStart: (info) => {
    logger.info(`Bot @${info.username} started`);
    const maxToken = process.env.MAX_BOT_TOKEN?.trim();
    const notificationSender = {
      async sendToTelegram(chatId: string, text: string, buttons?: import('./bot/transport/types.js').InlineButton[][]) {
        const reply_markup = buttons ? toGrammyInlineKeyboard(buttons) : undefined;
        await bot.api.sendMessage(chatId, text, { reply_markup });
      },
      ...(maxToken
        ? {
            async sendToMax(maxUserId: string, text: string, buttons?: import('./bot/transport/types.js').InlineButton[][]) {
              await sendMaxMessage(maxToken, maxUserId, text, buttons);
            },
          }
        : {}),
    };
    initNotificationScheduler(getPool(), notificationSender);
    if (maxToken) runMaxPolling(maxToken, sessionStore, deps);
    metricsServer.listen(METRICS_PORT, () => {
      logger.info({ port: METRICS_PORT }, 'Health & Metrics server listening');
      notifySystemdReady();
      startSystemdWatchdogLoop();
    });
  },
});
