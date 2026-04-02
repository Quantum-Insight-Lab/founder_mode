/**
 * Безопасные поля для лога из ошибки Grammy bot.catch (без ctx.api / токена).
 */
export function botCatchErrorForLog(err: unknown): {
  outerMessage: string;
  outerStack?: string;
  causeMessage: string;
  causeStack?: string;
  telegramUserId?: number;
} {
  const wrapped = err as { ctx?: { from?: { id?: number } }; error?: unknown };
  const inner = wrapped?.error !== undefined ? wrapped.error : err;
  const outerMessage = err instanceof Error ? err.message : String(err);
  const outerStack = err instanceof Error ? err.stack : undefined;
  const causeMessage = inner instanceof Error ? inner.message : String(inner ?? '');
  const causeStack = inner instanceof Error ? inner.stack : undefined;
  const telegramUserId = wrapped?.ctx?.from?.id;
  return {
    outerMessage,
    ...(outerStack && { outerStack }),
    causeMessage,
    ...(causeStack && { causeStack }),
    ...(telegramUserId != null && { telegramUserId }),
  };
}
