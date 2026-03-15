import { describe, it, expect } from 'vitest';
import {
  formatDay,
  formatDayFull,
  formatDays,
  formatTime,
} from '../src/domain/date-format.js';

describe('domain/date-format', () => {
  describe('formatDay', () => {
    it('returns short day name for valid index', () => {
      expect(formatDay(0)).toBe('вс');
      expect(formatDay(1)).toBe('пн');
      expect(formatDay(6)).toBe('сб');
    });

    it('returns ? for out of range', () => {
      expect(formatDay(7)).toBe('?');
      expect(formatDay(-1)).toBe('?');
    });
  });

  describe('formatDayFull', () => {
    it('returns full day name for valid index', () => {
      expect(formatDayFull(0)).toBe('Воскресенье');
      expect(formatDayFull(5)).toBe('Пятница');
    });
  });

  describe('formatDays', () => {
    it('returns formatted string for valid days', () => {
      expect(formatDays('0,1,2')).toBe('вс,пн,вт');
      expect(formatDays('1,2,3,4,5')).toBe('пн,вт,ср,чт,пт');
    });

    it('returns — for null or empty', () => {
      expect(formatDays(null)).toBe('—');
      expect(formatDays('')).toBe('—');
    });

    it('returns — when no valid days', () => {
      expect(formatDays('7,8,9')).toBe('—');
    });

    it('filters invalid and trims', () => {
      expect(formatDays(' 1 , 2 , 3 ')).toBe('пн,вт,ср');
    });
  });

  describe('formatTime', () => {
    it('returns time for valid format', () => {
      expect(formatTime('18:00')).toBe('18:00');
      expect(formatTime('9:30')).toBe('9:30');
    });

    it('returns — for invalid', () => {
      expect(formatTime(null)).toBe('—');
      expect(formatTime('')).toBe('—');
      expect(formatTime('18:00:00')).toBe('—');
      expect(formatTime('invalid')).toBe('—');
    });
  });
});
