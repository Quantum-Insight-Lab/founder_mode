/**
 * Domain validators (pure logic, no I/O).
 */
import { invariant } from './errors.js';

/**
 * INV-004: Fixation date cannot be in the future (relative to user's today)
 */
export function validateFixationDate(dateStr: string, todayStr: string): void {
  invariant(
    dateStr <= todayStr,
    'Фиксация только за прошедшие дни',
    '004'
  );
}

/**
 * INV-008: Fixation has valid branch — required fields by movement_branch
 */
export function validateFixationBranch(data: {
  movement_branch: 'yes' | 'no' | 'partial';
  had_movement?: boolean;
  what_moved?: string;
  tomorrow_step?: string;
  what_stopped?: string;
  attention_sink?: string;
  why_partial?: string;
}): void {
  const filled = (s?: string) => (s ?? '').trim().length > 0;
  const branch = data.movement_branch;
  if (branch === 'yes') {
    invariant(
      filled(data.what_moved) && filled(data.tomorrow_step),
      'При движении заполни: что продвинуло, шаг на завтра',
      '008'
    );
  } else if (branch === 'no') {
    invariant(
      filled(data.what_stopped) && filled(data.attention_sink) && filled(data.tomorrow_step),
      'Без движения заполни: что остановило, что заняло внимание, как вернуть вектор',
      '008'
    );
  } else if (branch === 'partial') {
    invariant(
      filled(data.what_moved) &&
      filled(data.why_partial) &&
      filled(data.tomorrow_step),
      'В ветке «Частично» заполни: что удалось сделать, почему частично, шаг на завтра',
      '008'
    );
  } else {
    invariant(false, 'Недопустимая ветка фиксации', '008');
  }
}
