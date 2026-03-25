import { describe, it, expect } from 'vitest';
import {
  addDaysYmd,
  isWeekendYmd,
  lastNWeekdaysOldestFirst,
} from '../src/domain/rhythm-weekdays.js';

describe('rhythm-weekdays', () => {
  it('isWeekendYmd: 2026-03-21 Sat, 2026-03-22 Sun', () => {
    expect(isWeekendYmd('2026-03-21')).toBe(true);
    expect(isWeekendYmd('2026-03-22')).toBe(true);
    expect(isWeekendYmd('2026-03-23')).toBe(false);
    expect(isWeekendYmd('2026-03-20')).toBe(false);
  });

  it('lastNWeekdaysOldestFirst: 14 будних, порядок старый → новый', () => {
    const end = '2026-03-25'; // ср
    const w = lastNWeekdaysOldestFirst(end, 14);
    expect(w).toHaveLength(14);
    expect(w[13]).toBe(end);
    for (const ymd of w) expect(isWeekendYmd(ymd)).toBe(false);
    for (let i = 1; i < w.length; i++) {
      expect(w[i]! > w[i - 1]!).toBe(true);
    }
  });

  it('если end — воскресенье, первый учитываемый день — пятница', () => {
    const end = '2026-03-22'; // вс
    const w = lastNWeekdaysOldestFirst(end, 3);
    expect(w).toEqual(['2026-03-18', '2026-03-19', '2026-03-20']);
  });

  it('addDaysYmd', () => {
    expect(addDaysYmd('2026-03-10', -1)).toBe('2026-03-09');
    expect(addDaysYmd('2026-03-10', 1)).toBe('2026-03-11');
  });
});
