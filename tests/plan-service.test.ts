import { describe, it, expect } from 'vitest';
import { getWeekId, getWeekStartEnd } from '../src/services/plan-service.js';

describe('plan-service', () => {
  describe('getWeekId', () => {
    it('returns YYYYMMDD of week start (Monday)', () => {
      // 2026-03-09 is Monday
      const mon = new Date('2026-03-09T12:00:00Z');
      expect(getWeekId(mon)).toBe('20260309'); // Monday 2026-03-09
    });

    it('Sunday belongs to previous week that starts on Monday', () => {
      const sun = new Date('2026-03-08T12:00:00Z');
      expect(getWeekId(sun)).toBe('20260302'); // Monday 2026-03-02
    });

    it('switches to a new week on Monday after Sunday', () => {
      const sunday = new Date('2026-03-08T12:00:00Z');
      const monday = new Date('2026-03-09T12:00:00Z');
      expect(getWeekId(sunday)).toBe('20260302');
      expect(getWeekId(monday)).toBe('20260309');
    });

    it('year boundary', () => {
      const dec31 = new Date('2025-12-31T12:00:00Z'); // Wed
      expect(getWeekId(dec31)).toBe('20251229'); // Mon 2025-12-29
    });
  });

  describe('getWeekStartEnd', () => {
    it('returns start and end of week (Mon-Sun)', () => {
      const mon = new Date('2026-03-09T12:00:00Z');
      const { start, end } = getWeekStartEnd(mon);
      expect(start).toBe('2026-03-09');
      expect(end).toBe('2026-03-15');
    });

    it('Sunday: range still points to Monday-start week', () => {
      const sun = new Date('2026-03-08T12:00:00Z');
      const { start, end } = getWeekStartEnd(sun);
      expect(start).toBe('2026-03-02');
      expect(end).toBe('2026-03-08');
    });
  });
});
