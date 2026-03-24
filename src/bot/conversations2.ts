/**
 * Альтернативный сценарий Founder Mode по механике из doc.md:
 * Declaration -> Daily Reflection (Пн-Чт, обязательно) -> Report -> Reset
 * Execution Logs — опциональный слой.
 */

export const WEEKLY_DECLARATION_QUESTIONS = [
  { key: 'main_focus', text: 'Один главный приоритет на неделю?' },
  { key: 'win_result', text: 'Какой артефакт или результат должен появиться к концу недели?' },
  { key: 'week_failure', text: 'Что будет считаться провалом недели?' },
] as const;

export type WeeklyDeclarationAnswerKey = (typeof WEEKLY_DECLARATION_QUESTIONS)[number]['key'];

export const DAILY_REFLECTION_MOVEMENT_QUESTION = 'Было ли сегодня движение по главному приоритету?';

export const DAILY_REFLECTION_QUESTIONS_MOVEMENT = [
  { key: 'what_moved', text: 'Что готово по главному?' },
  { key: 'attention_sink', text: 'Что ещё заняло внимание?' },
  { key: 'tomorrow_step', text: 'Какой следующий шаг на завтра?' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const DAILY_REFLECTION_QUESTIONS_NO_MOVEMENT = [
  { key: 'what_stopped', text: 'Что остановило движение?' },
  { key: 'attention_sink', text: 'Что заняло основное внимание?' },
  { key: 'tomorrow_step', text: 'Как мягко вернуть вектор завтра? (одно дело <15 минут)' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const DAILY_REFLECTION_QUESTIONS_PARTIAL = [
  { key: 'what_moved', text: 'Что удалось сделать по главному приоритету?' },
  { key: 'why_partial', text: 'Почему движение осталось частичным?' },
  { key: 'attention_sink', text: 'Что ещё заняло внимание?' },
  { key: 'tomorrow_step', text: 'Какой следующий шаг на завтра?' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const DAILY_REFLECTION_QUESTIONS_WEEK_CLOSED = [
  { key: 'new_focus', text: 'Какой новый фокус выбран?' },
  { key: 'what_moved', text: 'Что уже удалось по нему сделать?' },
  { key: 'attention_sink', text: 'Что ещё заняло внимание?' },
  { key: 'tomorrow_step', text: 'Какой следующий шаг?' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export type DailyReflectionMovementAnswerKey =
  (typeof DAILY_REFLECTION_QUESTIONS_MOVEMENT)[number]['key'];
export type DailyReflectionNoMovementAnswerKey =
  (typeof DAILY_REFLECTION_QUESTIONS_NO_MOVEMENT)[number]['key'];
export type DailyReflectionPartialAnswerKey =
  (typeof DAILY_REFLECTION_QUESTIONS_PARTIAL)[number]['key'];
export type DailyReflectionWeekClosedAnswerKey =
  (typeof DAILY_REFLECTION_QUESTIONS_WEEK_CLOSED)[number]['key'];

export const EXECUTION_LOG_QUESTIONS = [
  { key: 'done', text: 'Что сделано по приоритету за неделю?' },
  { key: 'block', text: 'Где возник блок?' },
  { key: 'decision', text: 'Какое решение принято?' },
  { key: 'hypothesis', text: 'Какую гипотезу проверяем?' },
] as const;

export const EXECUTION_LOG_OPTIONAL_NOTE =
  'Execution Log не обязателен: заполняется только если нужен внешний/командный апдейт.';

export type ExecutionLogAnswerKey = (typeof EXECUTION_LOG_QUESTIONS)[number]['key'];

export const RESULT_REPORT_QUESTIONS = [
  { key: 'review_user_note', text: 'Что ты считаешь главным итогом недели, если сказать одной строкой?' },
] as const;

export type ReportAnswerKey = (typeof RESULT_REPORT_QUESTIONS)[number]['key'];

export const WEEKLY_RESET_QUESTIONS = [
  { key: 'keep', text: 'Что оставить в следующем цикле?' },
  { key: 'remove', text: 'Что убрать?' },
  { key: 'amplify', text: 'Что усилить?' },
  { key: 'new_focus', text: 'Какой новый приоритет выбрать?' },
] as const;

export type WeeklyResetAnswerKey = (typeof WEEKLY_RESET_QUESTIONS)[number]['key'];
