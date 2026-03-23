import { describe, it, expect } from 'vitest';
import {
  userTimeToTimezone,
  parseTimezoneOffset,
  dateStrToWeekRef,
  instantToUserLocalDateString,
} from '../src/domain/timezone.js';

describe('domain/timezone', () => {
  describe('userTimeToTimezone', () => {
    it('returns null for invalid hours/minutes', () => {
      expect(userTimeToTimezone(-1, 0)).toBeNull();
      expect(userTimeToTimezone(24, 0)).toBeNull();
      expect(userTimeToTimezone(12, -1)).toBeNull();
      expect(userTimeToTimezone(12, 60)).toBeNull();
    });

    it('returns UTC+0 when user time equals server time', () => {
      const server = new Date('2026-03-09T14:30:00Z');
      expect(userTimeToTimezone(14, 30, server)).toBe('UTC+0');
    });

    it('returns UTC+N when user is ahead', () => {
      const server = new Date('2026-03-09T12:00:00Z');
      expect(userTimeToTimezone(15, 0, server)).toBe('UTC+3');
    });

    it('returns UTC-N when user is behind', () => {
      const server = new Date('2026-03-09T12:00:00Z');
      expect(userTimeToTimezone(9, 0, server)).toBe('UTC-3');
    });

    it('handles midnight wrap', () => {
      const server = new Date('2026-03-09T23:00:00Z');
      expect(userTimeToTimezone(2, 0, server)).toBe('UTC+3');
    });
  });

  describe('parseTimezoneOffset', () => {
    it('parses UTC+N', () => {
      expect(parseTimezoneOffset('UTC+3')).toBe(180);
      expect(parseTimezoneOffset('UTC+0')).toBe(0);
    });

    it('parses UTC-N', () => {
      expect(parseTimezoneOffset('UTC-5')).toBe(-300);
    });

    it('returns null for invalid format', () => {
      expect(parseTimezoneOffset('')).toBeNull();
      expect(parseTimezoneOffset('GMT+3')).toBeNull();
      expect(parseTimezoneOffset('UTC3')).toBeNull();
      expect(parseTimezoneOffset('  UTC+3  ')).toBe(180);
    });
  });

  describe('dateStrToWeekRef', () => {
    it('returns noon UTC of given date', () => {
      const d = dateStrToWeekRef('2026-03-09');
      expect(d.toISOString()).toBe('2026-03-09T12:00:00.000Z');
    });
  });

  describe('instantToUserLocalDateString', () => {
    it('uses UTC calendar day when offset is null', () => {
      const t = new Date('2026-03-21T22:30:00Z');
      expect(instantToUserLocalDateString(t, null)).toBe('2026-03-21');
    });

    it('shifts calendar day for UTC+3 like getUserLocalDate', () => {
      // 21:00 UTC on 2026-03-21 → local date 2026-03-22 for UTC+3
      const t = new Date('2026-03-21T21:00:00.000Z');
      expect(instantToUserLocalDateString(t, 180)).toBe('2026-03-22');
    });
  });
});
