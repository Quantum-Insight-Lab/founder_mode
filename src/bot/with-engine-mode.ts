import type { AppContext } from './transport/types.js';
import type { HandlerDeps } from './handlers/deps.js';
import { isEngineMode, type EngineMode } from '../services/product-mode.js';
import { getModeConfig } from '../modes/registry.js';
import type { ModeConfig } from '../modes/types.js';
import { wrongProductModeHint } from './product-mode-copy.js';

export async function requireEngineMode(
  ctx: AppContext,
  deps: HandlerDeps
): Promise<{ mode: EngineMode; config: ModeConfig } | null> {
  const mode = await deps.getUserProductMode(ctx.userId);
  if (!isEngineMode(mode)) {
    await ctx.reply(wrongProductModeHint(mode, 'learning'));
    return null;
  }
  return { mode, config: getModeConfig(mode) };
}

export function withEngineMode(
  handler: (
    ctx: AppContext,
    deps: HandlerDeps,
    mode: EngineMode,
    config: ModeConfig
  ) => Promise<void>
): (ctx: AppContext, deps: HandlerDeps) => Promise<void> {
  return async (ctx, deps) => {
    const resolved = await requireEngineMode(ctx, deps);
    if (!resolved) return;
    return handler(ctx, deps, resolved.mode, resolved.config);
  };
}
