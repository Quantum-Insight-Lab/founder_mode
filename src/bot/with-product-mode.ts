import type { AppContext } from './transport/types.js';
import type { HandlerDeps } from './handlers/deps.js';
import type { ProductMode } from '../services/product-mode.js';
import { wrongProductModeHint } from './product-mode-copy.js';

export function withProductMode(
  required: ProductMode,
  handler: (ctx: AppContext, deps: HandlerDeps) => Promise<void>
): (ctx: AppContext, deps: HandlerDeps) => Promise<void> {
  return async (ctx, deps) => {
    const mode = await deps.getUserProductMode(ctx.userId);
    if (mode !== required) {
      await ctx.reply(wrongProductModeHint(mode, required));
      return;
    }
    return handler(ctx, deps);
  };
}
