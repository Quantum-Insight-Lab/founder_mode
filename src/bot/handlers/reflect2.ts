import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { ensureSession } from '../context.js';
import { buildAppContext } from '../transport/telegram-adapter.js';
import type { AppContext } from '../transport/types.js';
import { logger } from '../../observability/logger.js';
import type { HandlerDeps } from './deps.js';
import { handleReflectCommand } from './reflect.js';

export async function handleReflect2Command(ctx: AppContext, deps: HandlerDeps): Promise<void> {
  logger.info({ channel: ctx.channel, externalId: ctx.externalId }, 'Command /reflect2');
  ensureSession(ctx);
  ctx.session.reflectionPromptVariant = 'v2';
  await handleReflectCommand(ctx, deps);
}

export function registerReflect2Handlers(bot: Bot<BotContext>, deps: HandlerDeps): void {
  bot.command('reflect2', async (ctx) => {
    const appCtx = buildAppContext(ctx as BotContext & { userId?: string });
    await handleReflect2Command(appCtx, deps);
  });
}
