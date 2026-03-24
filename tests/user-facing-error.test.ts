import { describe, it, expect } from 'vitest';
import { InvariantViolationError } from '../src/domain/errors.js';
import { formatUserFacingError, USER_SERVICE_ERROR_FALLBACK } from '../src/bot/user-facing-error.js';

describe('formatUserFacingError', () => {
  it('formats invariant with prefix when missing', () => {
    const err = new InvariantViolationError('Нужна declaration', 'NOT_FOUND');
    expect(formatUserFacingError(err)).toBe('❌ Нужна declaration');
  });

  it('keeps message that already has emoji', () => {
    const err = new InvariantViolationError('❌ Уже есть', '004');
    expect(formatUserFacingError(err)).toBe('❌ Уже есть');
  });

  it('fallback for non-invariant errors', () => {
    expect(formatUserFacingError(new Error('boom'))).toBe(USER_SERVICE_ERROR_FALLBACK);
  });
});
