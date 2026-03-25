/**
 * Founder «Ритм» (0–100): темп и управляемость, без оценки личности.
 * Окно — 14 последних будних дней (без суббот/воскресений), задаётся снаружи;
 * день без фиксации в окне = как «без движения» (вес как no).
 */

export type MovementBranch = 'yes' | 'no' | 'partial' | 'week_closed';

export interface RhythmDay {
  /** YYYY-MM-DD */
  date: string;
  /** null — нет фиксации за день */
  branch: MovementBranch | null;
}

const W = {
  yes: 1,
  partial: 0.7,
  no: 0.4,
  week_closed: 1,
  missing: 0.4,
} as const;

const FLOW_MIN = W.missing;
const FLOW_MAX = 1;

/** Вес дня для Flow (среднее за 14 дней). */
export function dayWeight(branch: MovementBranch | null): number {
  if (branch == null) return W.missing;
  return branch === 'yes'
    ? W.yes
    : branch === 'partial'
      ? W.partial
      : branch === 'no'
        ? W.no
        : W.week_closed;
}

/** Дни «нет движения» для streak: только no или отсутствие фиксации. */
export function isNoMovementDay(branch: MovementBranch | null): boolean {
  return branch === null || branch === 'no';
}

/** Возврат: после no/missing на следующий день yes/partial/week_closed. */
export function isReturnDay(branch: MovementBranch | null): boolean {
  return branch === 'yes' || branch === 'partial' || branch === 'week_closed';
}

/** Flow 0..1 из среднего веса за окно. */
export function flow01(days: RhythmDay[]): number {
  if (days.length === 0) return 0;
  const mean = days.reduce((s, d) => s + dayWeight(d.branch), 0) / days.length;
  const raw = (mean - FLOW_MIN) / (FLOW_MAX - FLOW_MIN);
  return Math.max(0, Math.min(1, raw));
}

/** Completion: есть report за текущую или предыдущую календарную неделю. */
export function completion01(hasReportCurrentOrPreviousWeek: boolean): number {
  return hasReportCurrentOrPreviousWeek ? 1 : 0;
}

/**
 * Stability: суффикс от конца окна (последний день = «сегодня»).
 * Дни подряд только no/missing; 2 дня — норма, 5+ — распад.
 */
export function stability01(daysOrderedOldestFirst: RhythmDay[]): number {
  if (daysOrderedOldestFirst.length === 0) return 1;
  let streak = 0;
  for (let i = daysOrderedOldestFirst.length - 1; i >= 0; i--) {
    const b = daysOrderedOldestFirst[i]!.branch;
    if (isNoMovementDay(b)) streak += 1;
    else break;
  }
  if (streak <= 2) return 1;
  if (streak >= 5) return 0;
  return Math.max(0, Math.min(1, 1 - (streak - 2) / 3));
}

/** Recovery: пары (день i = no/missing, день i+1 = yes/partial/week_closed). */
export function recovery01(daysOrderedOldestFirst: RhythmDay[]): number {
  if (daysOrderedOldestFirst.length < 2) return 0;
  let n = 0;
  for (let i = 0; i < daysOrderedOldestFirst.length - 1; i++) {
    const a = daysOrderedOldestFirst[i]!.branch;
    const b = daysOrderedOldestFirst[i + 1]!.branch;
    if (isNoMovementDay(a) && isReturnDay(b)) n += 1;
  }
  return Math.max(0, Math.min(1, n / 2));
}

const WEIGHT_FLOW = 0.4;
const WEIGHT_COMPLETION = 0.25;
const WEIGHT_STABILITY = 0.25;
const WEIGHT_RECOVERY = 0.1;

export function computeRhythmScore(
  daysOrderedOldestFirst: RhythmDay[],
  hasReportCurrentOrPreviousWeek: boolean
): number {
  const f = flow01(daysOrderedOldestFirst);
  const c = completion01(hasReportCurrentOrPreviousWeek);
  const s = stability01(daysOrderedOldestFirst);
  const r = recovery01(daysOrderedOldestFirst);
  const raw =
    WEIGHT_FLOW * f +
    WEIGHT_COMPLETION * c +
    WEIGHT_STABILITY * s +
    WEIGHT_RECOVERY * r;
  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}
