import { describe, it, expect } from 'vitest';
import { validateFixationDate, validateFixationBranch } from '../src/domain/validators.js';
import { InvariantViolationError } from '../src/domain/errors.js';

describe('validators', () => {
  describe('INV-004: validateFixationDate', () => {
    it('throws when date is in the future', () => {
      expect(() => validateFixationDate('2026-03-10', '2026-03-09')).toThrow(InvariantViolationError);
      expect(() => validateFixationDate('2026-03-10', '2026-03-09')).toThrow('Фиксация только за прошедшие дни');
    });

    it('passes when date is today', () => {
      expect(() => validateFixationDate('2026-03-09', '2026-03-09')).not.toThrow();
    });

    it('passes when date is in the past', () => {
      expect(() => validateFixationDate('2026-03-08', '2026-03-09')).not.toThrow();
    });
  });

  describe('INV-008: validateFixationBranch', () => {
    it('throws when movement_branch=yes but required fields empty', () => {
      expect(() =>
        validateFixationBranch({ movement_branch: 'yes', what_moved: '', tomorrow_step: '' })
      ).toThrow(/заполни/);
      expect(() =>
        validateFixationBranch({ movement_branch: 'yes', what_moved: 'a', tomorrow_step: '' })
      ).toThrow(/заполни/);
    });

    it('throws when movement_branch=no but required fields empty', () => {
      expect(() =>
        validateFixationBranch({
          movement_branch: 'no',
          what_stopped: '',
          attention_sink: '',
          tomorrow_step: '',
        })
      ).toThrow(/заполни/);
    });

    it('passes when movement_branch=yes and required fields filled', () => {
      expect(() =>
        validateFixationBranch({ movement_branch: 'yes', what_moved: 'a', tomorrow_step: 'c' })
      ).not.toThrow();
    });

    it('passes when movement_branch=no and all fields filled', () => {
      expect(() =>
        validateFixationBranch({
          movement_branch: 'no',
          what_stopped: 'a',
          attention_sink: 'c',
          tomorrow_step: 'd',
        })
      ).not.toThrow();
    });

    it('passes when movement_branch=partial and required fields filled', () => {
      expect(() =>
        validateFixationBranch({
          movement_branch: 'partial',
          what_moved: 'a',
          why_partial: 'b',
          tomorrow_step: 'd',
        })
      ).not.toThrow();
    });

  });
});
