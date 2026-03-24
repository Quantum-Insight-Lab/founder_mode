import { InvariantViolationError } from '../domain/errors.js';

export const USER_SERVICE_ERROR_FALLBACK =
  '❌ Сервисная ошибка зафиксирована и передана разработчику. Попробуйте позже.';

/** User-visible string for errors (no metrics / logging). */
export function formatUserFacingError(err: unknown): string {
  if (err instanceof InvariantViolationError) {
    const msg = err.message;
    return msg.startsWith('❌') ? msg : `❌ ${msg}`;
  }
  return USER_SERVICE_ERROR_FALLBACK;
}
