/**
 * Окно «Ритма»: последние N будних дней (пн–пт), без суббот и воскресений.
 * Даты YYYY-MM-DD — календарные дни пользователя; день недели через полдень UTC, как в остальном коде.
 */

export function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** true если суббота или воскресенье (getUTCDay: 0 = вс, 6 = сб). */
export function isWeekendYmd(ymd: string): boolean {
  const dow = new Date(ymd + 'T12:00:00Z').getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Последние `n` будних дней, отсчитывая назад от `endYmd` (включая его, если это будний).
 * Порядок: от самой старой даты к самой новой (как для rhythm-score).
 */
export function lastNWeekdaysOldestFirst(endYmd: string, n: number): string[] {
  const newestFirst: string[] = [];
  let cur = endYmd;
  while (newestFirst.length < n) {
    if (!isWeekendYmd(cur)) newestFirst.push(cur);
    cur = addDaysYmd(cur, -1);
  }
  return newestFirst.reverse();
}
