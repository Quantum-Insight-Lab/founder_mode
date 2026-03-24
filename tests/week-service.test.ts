import { describe, it, expect } from 'vitest';
import { getWeekId, getWeekStartEnd } from '../src/services/week-service.js';

describe('week-service', () => {
  describe('getWeekId', () => {
    it('returns YYYYMMDD of week start (Monday) for local calendar date', () => {
      expect(getWeekId('2026-03-09')).toBe('20260309');
    });

    it('Sunday belongs to previous week that starts on Monday', () => {
      expect(getWeekId('2026-03-08')).toBe('20260302');
    });

    it('switches to a new week on Monday after Sunday', () => {
      expect(getWeekId('2026-03-08')).toBe('20260302');
      expect(getWeekId('2026-03-09')).toBe('20260309');
    });

    it('year boundary', () => {
      expect(getWeekId('2025-12-31')).toBe('20251229');
    });
  });

  describe('getWeekStartEnd', () => {
    it('returns start and end of week (Mon-Sun)', () => {
      const { start, end } = getWeekStartEnd('2026-03-09');
      expect(start).toBe('2026-03-09');
      expect(end).toBe('2026-03-15');
    });

    it('Sunday: range still points to Monday-start week', () => {
      const { start, end } = getWeekStartEnd('2026-03-08');
      expect(start).toBe('2026-03-02');
      expect(end).toBe('2026-03-08');
    });
  });
});
