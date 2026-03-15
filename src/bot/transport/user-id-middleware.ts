import type { NextFunction } from 'grammy';

type EnsureUser = (channel: 'telegram' | 'max', externalId: string) => Promise<string>;

/** Sets ctx.userId from ensureUser('telegram', ctx.from.id) so session can be keyed by user_id. */
export function userIdMiddleware(ensureUser: EnsureUser) {
  return async (ctx: { from?: { id?: number }; userId?: string }, next: NextFunction) => {
    if (ctx.from?.id != null) {
      (ctx as { userId?: string }).userId = await ensureUser('telegram', String(ctx.from.id));
    }
    await next();
  };
}
