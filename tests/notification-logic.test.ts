import { describe, it, expect } from 'vitest';
import {
  computeUserLocalNotificationClock,
  matchesFixationNotificationWindow,
  matchesNotificationTimeInWindow,
} from '../src/scheduler/notification-logic.js';

describe('notification-logic', () => {
  describe('computeUserLocalNotificationClock', () => {
    it('UTC+3: same calendar day mapping', () => {
      const now = new Date('2026-03-24T15:00:00.000Z');
      const c = computeUserLocalNotificationClock(now, 180);
      expect(c.userDateStr).toBe('2026-03-24');
      expect(c.userWeekId).toBe('20260323');
    });
  });

  describe('matchesNotificationTimeInWindow', () => {
    it('matches inside ±window', () => {
      expect(matchesNotificationTimeInWindow(1, 10 * 60 + 5, 1, '10:10', 7)).toBe(true);
    });

    it('rejects wrong day', () => {
      expect(matchesNotificationTimeInWindow(2, 10 * 60, 1, '10:00', 7)).toBe(false);
    });

    it('rejects missing config', () => {
      expect(matchesNotificationTimeInWindow(1, 600, null, '10:00', 7)).toBe(false);
    });
  });

  describe('matchesFixationNotificationWindow', () => {
    it('matches listed day', () => {
      expect(matchesFixationNotificationWindow(3, 9 * 60 + 30, '1,3,5', '09:30', 7)).toBe(true);
    });

    it('skips unlisted day', () => {
      expect(matchesFixationNotificationWindow(2, 9 * 60 + 30, '1,3,5', '09:30', 7)).toBe(false);
    });
  });
});
