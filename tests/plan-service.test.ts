import { describe, it, expect } from 'vitest';
import { getWeekId, getWeekStartEnd } from '../src/services/plan-service.js';

describe('plan-service', () => {
  describe('getWeekId', () => {
    it('returns YYYYMMDD of week start (Sunday)', () => {
      // 2026-03-09 is Monday
      const mon = new Date('2026-03-09T12:00:00Z');
      expect(getWeekId(mon)).toBe('20260308'); // Sunday 2026-03-08
    });

    it('Sunday returns same day', () => {
      const sun = new Date('2026-03-08T12:00:00Z');
      expect(getWeekId(sun)).toBe('20260308');
    });

    it('year boundary', () => {
      const dec31 = new Date('2025-12-31T12:00:00Z'); // Wed
      expect(getWeekId(dec31)).toBe('20251228'); // Sun 2025-12-28
    });
  });

  describe('getWeekStartEnd', () => {
    it('returns start and end of week (Sun–Sat)', () => {
      const mon = new Date('2026-03-09T12:00:00Z');
      const { start, end } = getWeekStartEnd(mon);
      expect(start).toBe('2026-03-08');
      expect(end).toBe('2026-03-14');
    });

    it('Sunday: start equals end minus 6 days', () => {
      const sun = new Date('2026-03-08T12:00:00Z');
      const { start, end } = getWeekStartEnd(sun);
      expect(start).toBe('2026-03-08');
      expect(end).toBe('2026-03-14');
    });
  });
});
