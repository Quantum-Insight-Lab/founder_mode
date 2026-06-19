import type { Bot } from 'grammy';
import type { BotContext } from './context.js';
import { buildAppContext } from './transport/telegram-adapter.js';
import type { AppContext } from './transport/types.js';
import type { HandlerDeps } from './handlers/deps.js';
import type { ProductMode } from '../services/product-mode.js';
import { withProductMode } from './with-product-mode.js';

function toAppCtx(ctx: BotContext & { userId?: string }): AppContext {
  return buildAppContext(ctx);
}

export function registerGuardedCommand(
  bot: Bot<BotContext>,
  deps: HandlerDeps,
  mode: ProductMode,
  name: string,
  handler: (ctx: AppContext, deps: HandlerDeps) => Promise<void>
): void {
  bot.command(name, async (ctx) => {
    await withProductMode(mode, handler)(toAppCtx(ctx), deps);
  });
}

export function registerGuardedCallback(
  bot: Bot<BotContext>,
  deps: HandlerDeps,
  mode: ProductMode,
  data: string,
  handler: (ctx: AppContext, deps: HandlerDeps) => Promise<void>
): void {
  bot.callbackQuery(data, async (ctx) => {
    await withProductMode(mode, handler)(toAppCtx(ctx), deps);
  });
}
