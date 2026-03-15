import 'dotenv/config';
import http from 'http';
import { Bot, session } from 'grammy';
import { logger } from './observability/logger.js';
import { register } from './observability/metrics.js';
import { runWithNewTrace } from './observability/trace.js';
import type { BotContext, SessionData } from './bot/context.js';
import { registerHandlers } from './bot/handlers/index.js';
import { notifyDeveloper } from './observability/alert.js';
import { getPool } from './db/index.js';
import { initNotificationScheduler } from './observability/notifications.js';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is required');

const METRICS_PORT = parseInt(process.env.METRICS_PORT ?? '9090', 10);

const bot = new Bot<BotContext>(token);

bot.use((_ctx, next) => runWithNewTrace(() => next()));

bot.use(
  session({
    initial: (): SessionData => ({}),
    getSessionKey: (ctx) => ctx.from?.id?.toString(),
  })
);

registerHandlers(bot);

bot.catch((err: { ctx?: { api: unknown; from?: { id?: number } }; error?: unknown }) => {
  logger.error({ err }, 'Bot error');
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
    initNotificationScheduler(getPool(), bot.api);
    metricsServer.listen(METRICS_PORT, () => {
      logger.info({ port: METRICS_PORT }, 'Health & Metrics server listening');
    });
  },
});
