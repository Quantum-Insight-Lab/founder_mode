import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateReflectionDate, validateReflectionBranch } from '../src/domain/validators.js';
import { InvariantViolationError } from '../src/domain/errors.js';
import { getPool } from '../src/db/index.js';

const mockQuery = vi.hoisted(() => vi.fn());
const mockPool = { query: mockQuery };
vi.mock('../src/db/index.js', () => ({
  getPool: () => mockPool,
}));

describe('validators', () => {
  describe('INV-004: validateReflectionDate', () => {
    it('throws when date is in the future', () => {
      expect(() => validateReflectionDate('2026-03-10', '2026-03-09')).toThrow(InvariantViolationError);
      expect(() => validateReflectionDate('2026-03-10', '2026-03-09')).toThrow('Рефлексия только за прошедшие дни');
    });

    it('passes when date is today', () => {
      expect(() => validateReflectionDate('2026-03-09', '2026-03-09')).not.toThrow();
    });

    it('passes when date is in the past', () => {
      expect(() => validateReflectionDate('2026-03-08', '2026-03-09')).not.toThrow();
    });
  });

  describe('INV-008: validateReflectionBranch', () => {
    it('throws when movement_branch=yes but required fields empty', () => {
      expect(() =>
        validateReflectionBranch({ movement_branch: 'yes', what_moved: '', attention_sink: '', tomorrow_step: '' })
      ).toThrow(/заполни/);
      expect(() =>
        validateReflectionBranch({ movement_branch: 'yes', what_moved: 'a', attention_sink: '', tomorrow_step: 'c' })
      ).toThrow(/заполни/);
    });

    it('throws when movement_branch=no but required fields empty', () => {
      expect(() =>
        validateReflectionBranch({
          movement_branch: 'no',
          what_stopped: '',
          attention_sink: '',
          tomorrow_step: '',
          thought_of_day: '',
        })
      ).toThrow(/заполни/);
    });

    it('passes when movement_branch=yes and all fields filled', () => {
      expect(() =>
        validateReflectionBranch({ movement_branch: 'yes', what_moved: 'a', attention_sink: 'b', tomorrow_step: 'c' })
      ).not.toThrow();
    });

    it('passes when movement_branch=no and all fields filled', () => {
      expect(() =>
        validateReflectionBranch({
          movement_branch: 'no',
          what_stopped: 'a',
          attention_sink: 'c',
          tomorrow_step: 'd',
          thought_of_day: 'x',
        })
      ).not.toThrow();
    });

    it('passes when movement_branch=partial and all fields filled', () => {
      expect(() =>
        validateReflectionBranch({
          movement_branch: 'partial',
          what_moved: 'a',
          why_partial: 'b',
          attention_sink: 'c',
          tomorrow_step: 'd',
          thought_of_day: 'x',
        })
      ).not.toThrow();
    });

    it('passes when movement_branch=week_closed and all fields filled', () => {
      expect(() =>
        validateReflectionBranch({
          movement_branch: 'week_closed',
          new_focus: 'f',
          what_moved: 'd',
          tomorrow_step: 's',
        })
      ).not.toThrow();
    });
  });

  describe('INV-003: validateReviewMinData', () => {
    beforeEach(async () => {
      mockQuery.mockReset();
      vi.resetModules();
    });

    it('throws when no plan exists', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 0 });
      const { validateReviewMinData } = await import('../src/db/review-validation.js');
      await expect(
        validateReviewMinData(getPool(), 'user1', '20260309', '2026-03-09', '2026-03-15')
      ).rejects.toThrow('Нужен план недели для обзора');
    });

    it('throws when reflections count is 0', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
      const { validateReviewMinData } = await import('../src/db/review-validation.js');
      await expect(
        validateReviewMinData(getPool(), 'user1', '20260309', '2026-03-09', '2026-03-15')
      ).rejects.toThrow(/одна рефлексия|Сейчас: 0/);
    });

    it('passes when plan and 1 reflection exist', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 1 });
      const { validateReviewMinData } = await import('../src/db/review-validation.js');
      await expect(
        validateReviewMinData(getPool(), 'user1', '20260309', '2026-03-09', '2026-03-15')
      ).resolves.toBeUndefined();
    });

    it('passes when plan and 3+ reflections exist', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 3 });
      const { validateReviewMinData } = await import('../src/db/review-validation.js');
      await expect(
        validateReviewMinData(getPool(), 'user1', '20260309', '2026-03-09', '2026-03-15')
      ).resolves.toBeUndefined();
    });
  });
});
