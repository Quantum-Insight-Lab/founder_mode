/**
 * Day names and formatting for dates/times in UI
 */

export const DAY_NAMES_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;

export const DAY_NAMES_FULL: Record<number, string> = {
  0: 'Воскресенье',
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
};

export function formatDay(d: number): string {
  return DAY_NAMES_SHORT[d] ?? '?';
}

export function formatDayFull(d: number): string {
  return DAY_NAMES_FULL[d] ?? '?';
}

export function formatDays(daysStr: string | null): string {
  if (!daysStr) return '—';
  const days = daysStr.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => n >= 0 && n <= 6);
  if (days.length === 0) return '—';
  return days.map(formatDay).join(',');
}

export function formatTime(t: string | null): string {
  return t && /^\d{1,2}:\d{2}$/.test(t) ? t : '—';
}
