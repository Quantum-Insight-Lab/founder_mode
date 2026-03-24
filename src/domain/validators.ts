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
    'Рефлексия только за прошедшие дни',
    '004'
  );
}

/**
 * INV-008: Fixation has valid branch — required fields by movement_branch
 */
export function validateFixationBranch(data: {
  movement_branch: 'yes' | 'no' | 'partial' | 'week_closed';
  had_movement?: boolean;
  what_moved?: string;
  tomorrow_step?: string;
  what_stopped?: string;
  attention_sink?: string;
  thought_of_day?: string;
  why_partial?: string;
  new_focus?: string;
}): void {
  const filled = (s?: string) => (s ?? '').trim().length > 0;
  const branch = data.movement_branch;
  if (branch === 'yes') {
    invariant(
      filled(data.what_moved) && filled(data.attention_sink) && filled(data.tomorrow_step),
      'При движении заполни: что продвинуло, движение вне фокуса, шаг на завтра',
      '008'
    );
  } else if (branch === 'no') {
    invariant(
      filled(data.what_stopped) && filled(data.attention_sink) && filled(data.tomorrow_step) && filled(data.thought_of_day),
      'Без движения заполни: что остановило, что заняло внимание, как вернуть вектор, что стало понятнее',
      '008'
    );
  } else if (branch === 'partial') {
    invariant(
      filled(data.what_moved) &&
        filled(data.why_partial) &&
        filled(data.attention_sink) &&
        filled(data.tomorrow_step) &&
        filled(data.thought_of_day),
      'В ветке «Частично» заполни все поля',
      '008'
    );
  } else if (branch === 'week_closed') {
    invariant(
      filled(data.new_focus) &&
        filled(data.what_moved) &&
        filled(data.tomorrow_step) &&
        filled(data.thought_of_day),
      'В ветке «Результат недели закрыт» заполни: новый фокус, что сделано, следующий шаг, что стало понятнее',
      '008'
    );
  } else {
    invariant(false, 'Недопустимая ветка фиксации', '008');
  }
}
