import { describe, it, expect } from 'vitest';
import { validateLogDate } from '../src/domain/validators.js';
import { InvariantViolationError } from '../src/domain/errors.js';

describe('validators', () => {
  describe('validateLogDate', () => {
    it('throws when date is in the future', () => {
      expect(() => validateLogDate('2026-03-10', '2026-03-09')).toThrow(InvariantViolationError);
    });

    it('passes when date is today or past', () => {
      expect(() => validateLogDate('2026-03-09', '2026-03-09')).not.toThrow();
      expect(() => validateLogDate('2026-03-08', '2026-03-09')).not.toThrow();
    });
  });
});
