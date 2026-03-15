/**
 * Онбординг: первое сообщение (что делает бот, цикл, польза, команды, когда использовать)
 */
export const ONBOARDING_INTRO =
  `Добро пожаловать в Founder Mode.\n\n` +
  `Режим планирования и рефлексии.\n\n` +
  `<b>Цикл:</b>\n` +
  `план недели → рефлексия дня → обзор недели\n\n` +
  `План задаёт фокус.\n` +
  `Рефлексия фиксирует движение.\n` +
  `Обзор собирает всё в один срез.\n\n` +
  `<b>Команды:</b>\n` +
  `/plan\n` +
  `/reflect\n` +
  `/review\n` +
  `/settings\n` +
  `/delete`;

export const ONBOARDING_TIMEZONE_QUESTION = 'Для корректной работы потребуется таймзона.\n\nКакое у тебя сейчас время? (например, 14:30)';

export const ONBOARDING_TIMEZONE_INVALID =
  '⚠️ Формат некорректен. Будет использоваться таймзона сервера. Изменить можно в /settings.';
export const ONBOARDING_CTA_QUESTION = 'Начать планирование недели?';

/**
 * Planning: 6 questions flow
 */
export const PLANNING_QUESTIONS = [
  { key: 'current_state', text: 'С чего начинаешь неделю? (проекты, состояние)' },
  { key: 'main_focus', text: 'Главный фокус недели?' },
  { key: 'weekly_result', text: 'Конкретный результат недели? (измеримый итог)' },
  { key: 'why_now', text: 'Почему это важно именно сейчас?' },
  { key: 'distractions', text: 'Что ты точно не будешь делать?' },
  { key: 'main_risk', text: 'Что может пойти не так?' },
] as const;

/** Показывается под «Главный фокус недели?» при первом планировании пользователя */
export const MAIN_FOCUS_FIRST_PLANNING_HINT =
  '💡 Один приоритет — ключевой принцип.\nСписок задач рассеивает фокус. Один приоритет — это вектор.';

export type PlanningAnswerKey = (typeof PLANNING_QUESTIONS)[number]['key'];

/**
 * Reflection: intro + branched flow by had_movement
 */
export const REFLECTION_DATE_QUESTION = 'За какой день рефлексия?';

/** Подсказка при первом пропуске рефлексии (косой текст) */
export const REFLECTION_SKIP_HINT =
  '💡 Пропустил день? Уведомления помогут не забывать.';

export const REFLECTION_MOVEMENT_QUESTION = 'Было ли движение по главному фокусу?';

export const REFLECTION_QUESTIONS_MOVEMENT = [
  { key: 'what_moved', text: 'Расскажи о прогрессе:' },
  { key: 'attention_sink', text: 'Какое было движение вне фокуса?' },
  { key: 'tomorrow_step', text: 'Какой следующий шаг?' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const REFLECTION_QUESTIONS_NO_MOVEMENT = [
  { key: 'what_stopped', text: 'Что остановило?' },
  { key: 'attention_sink', text: 'Что заняло основное внимание?' },
  { key: 'tomorrow_step', text: 'Как мягко вернуть вектор? (одно дело <15 минут)' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const REFLECTION_QUESTIONS_PARTIAL = [
  { key: 'what_moved', text: 'Что удалось сделать?' },
  { key: 'why_partial', text: 'Почему движение осталось частичным?' },
  { key: 'attention_sink', text: 'Что ещё заняло внимание?' },
  { key: 'tomorrow_step', text: 'Следующий шаг по главному фокусу:' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const REFLECTION_QUESTIONS_WEEK_CLOSED = [
  { key: 'new_focus', text: 'Какой новый фокус выбран?' },
  { key: 'what_moved', text: 'Что удалось сделать по нему?' },
  { key: 'tomorrow_step', text: 'Какой следующий шаг?' },
] as const;

/** Вопрос перед генерацией обзора — усилитель смысла для LLM */
export const REVIEW_USER_NOTE_QUESTION = 'Что ты считаешь главным итогом недели, если сказать одной строкой?';

/** Time options for notification settings */
export const NOTIFICATION_TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00'] as const;

/** Settings */
export const SETTINGS_NOTIFICATIONS = 'Уведомления';
export const SETTINGS_PLAN = 'План';
export const SETTINGS_REFLECT = 'Рефлексия';
export const SETTINGS_REVIEW = 'Обзор';
export const SETTINGS_TIMEZONE = 'Таймзона';
export const SETTINGS_TIME_INPUT_QUESTION = 'Введите время (ЧЧ:ММ), например 14:30:';
export const SETTINGS_TIME_INVALID = '❌ Неверный формат. Введите время ЧЧ:ММ (например 14:30).';
