/**
 * Онбординг завершён: при /start показываем цикл и команды (без кнопок).
 */
export const ONBOARDING_INTRO =
  `Добро пожаловать в Founder Mode 👋\n\n` +
  `Режим планирования и рефлексии.\n\n` +
  `<b>Цикл:</b>\n` +
  `план недели → фиксация дня → обзор недели\n\n` +
  `План задаёт фокус.\n` +
  `Рефлексия фиксирует движение.\n` +
  `Обзор собирает всё в один срез.\n\n` +
  `<b>Команды:</b>\n` +
  `/declaration - спланировать неделю\n` +
  `/fixation - фиксировать день\n` +
  `/report - собрать обзор недели\n` +
  `/settings - настройки\n` +
  `/delete - удалить данные`;

/** Первый /start: сообщения 1–3, затем CTA */
export const ONBOARDING_MSG_1 =
  'Добро пожаловать 👋\n\nFounder Mode — это простой недельный цикл фокуса.\n\n' +
  'Ты выбираешь вектор.\n' +
  'Каждый вечер фиксируешь, было ли движение.\n' +
  'В конце получаешь сжатый обзор недели.\n\n' +
  'Это занимает около минуты в день.';

export const ONBOARDING_MSG_2 =
  'Большинство людей не стоят на месте.\n\n' +
  'Они либо откладывают главное,\n' +
  'либо распыляются на второстепенное.\n\n' +
  'Founder Mode нужен, чтобы увидеть, куда реально уходит внимание и есть ли движение по главному.';

export const ONBOARDING_MSG_3 =
  'Предлагаю эксперимент на текущую неделю.\n\n' +
  'Главное правило — не пропускать вечера.\n\n' +
  'Если пропустишь — ничего страшного.\n' +
  'Просто продолжим дальше.';

export const ONBOARDING_CTA_QUESTION = 'Начать эксперимент?';

export const ONBOARDING_CTA_LATER_FIRST_MSG = 'Хорошо. Когда захочешь — /start';

export const ONBOARDING_AFTER_CTA_YES =
  'Отлично.\n\n❗️ Эксперимент Founder Mode запущен.';

export const ONBOARDING_TIMEZONE_QUESTION =
  'Для корректной работы нужен твой часовой пояс.\n\nКакое у тебя сейчас время? (например, 14:30)';

export const ONBOARDING_TIMEZONE_INVALID =
  '⚠️ Формат некорректен. Устанавливаем часовой пояс <b>UTC+0</b> и продолжаем. Изменить можно в /settings.';

/** Fallback при неверном вводе времени в онбординге (сохраняется в user_settings). */
export const ONBOARDING_TIMEZONE_DEFAULT = 'UTC+0';

export const ONBOARDING_AFTER_TZ_PROMPT_PLAN =
  'Сейчас зафиксируем вектор текущей недели. Напиши (нажми) /declaration';

export const ONBOARDING_AFTER_PLAN_1 =
  '❗️ Вектор зафиксирован.\n\n' +
  'Теперь просто проживи рабочий день.\n\n' +
  'Вечером вернёмся и посмотрим, было ли движение по главному.\n\n' +
  'Напиши (нажми) /fixation когда придет время или поставь напоминание в /settings';

export const ONBOARDING_AFTER_PLAN_2 =
  '💡 Иногда уже через 2–3 дня становится видно, куда на самом деле уходит энергия.';

export const ONBOARDING_FIRST_REFLECT_INTRO =
  '💡 Давай быстро посмотрим, что на самом деле произошло сегодня.\n\nЭто займёт около минуты.';

export const ONBOARDING_NEXT_REFLECT_INTRO =
  '💡 Время коротко зафиксировать день. Посмотрим, было ли движение по главному.';

export const ONBOARDING_AFTER_REFLECT =
  '💡 День зафиксирован.\n\nЗавтра проверим,\nполучится ли сделать следующий шаг.';

export const ONBOARDING_AFTER_REFLECT_HINT = '💡 Часть эксперимента завершена.';

export const ONBOARDING_SATURDAY_REVIEW_INVITE =
  '💡 Неделя подходит к концу.\n\n' +
  'Давай соберём короткий обзор: что получилось, и куда двигаться дальше. Напиши (нажми) /report';

export const ONBOARDING_AFTER_REVIEW_1 =
  '💡 Эксперимент завершён.\n\n' +
  'Теперь у тебя есть:\n' +
  'вектор недели,\n' +
  'история ежедневного движения\n' +
  'и сжатый обзор результата.\n\n' +
  'Если захочешь очистить историю,\nможно удалить данные командой /delete.';

export const ONBOARDING_AFTER_REVIEW_QUESTION = 'Хочешь продолжить следующий недельный цикл?';

export const ONBOARDING_CTA_LATER_MSG =
  '💡 Хорошо.\n\n' +
  'Когда захочешь вернуться, мы начнём новый цикл с нового фокуса.\n\n' +
  'Founder Mode работает по календарной неделе\n(понедельник → воскресенье).\n\n' +
  'Обзор недели собирается по этому периоду.\n\n' +
  'Команды:\n' +
  '/declaration - спланировать неделю\n' +
  '/fixation - фиксировать день\n' +
  '/report - собрать обзор недели\n' +
  '/settings - настройки\n' +
  '/delete - удалить данные';

export const ONBOARDING_CTA_YES_FINAL_MSG =
  '💡 Отлично.\n\n' +
  'Founder Mode работает по календарной неделе\n(понедельник → воскресенье).\n\n' +
  'Обзор недели собирается по этому периоду.\n\n' +
  'Команды:\n' +
  '/declaration - спланировать неделю\n' +
  '/fixation - фиксировать день\n' +
  '/report - собрать обзор недели\n' +
  '/settings - настройки\n' +
  '/delete - удалить данные';

/**
 * Planning: 4 questions flow
 */
export const PLANNING_QUESTIONS = [
  { key: 'current_state', text: 'С чего начинаешь неделю? (проекты, состояние)' },
  { key: 'main_focus', text: 'Главный фокус недели?' },
  { key: 'weekly_result', text: 'Конкретный результат недели? (измеримый итог)' },
  { key: 'week_failure', text: 'Что будет считаться провалом недели?' },
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
  { key: 'what_moved', text: 'Расскажи о прогрессе по главному:' },
  { key: 'attention_sink', text: 'Что ещё заняло внимание?' },
  { key: 'tomorrow_step', text: 'Какой следующий шаг по главному фокусу?' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const REFLECTION_QUESTIONS_NO_MOVEMENT = [
  { key: 'what_stopped', text: 'Что остановило?' },
  { key: 'attention_sink', text: 'Что заняло основное внимание?' },
  { key: 'tomorrow_step', text: 'Как мягко вернуть вектор? (одно дело <15 минут)' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const REFLECTION_QUESTIONS_PARTIAL = [
  { key: 'what_moved', text: 'Что удалось сделать по главному?' },
  { key: 'why_partial', text: 'Почему движение осталось частичным?' },
  { key: 'attention_sink', text: 'Что ещё заняло внимание?' },
  { key: 'tomorrow_step', text: 'Следующий шаг по главному фокусу:' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

export const REFLECTION_QUESTIONS_WEEK_CLOSED = [
  { key: 'new_focus', text: 'Какой новый фокус выбран?' },
  { key: 'what_moved', text: 'Что удалось сделать по нему?' },
  { key: 'tomorrow_step', text: 'Какой следующий шаг?' },
  { key: 'thought_of_day', text: 'Что стало понятнее к концу дня?' },
] as const;

/** Вопрос перед генерацией обзора — усилитель смысла для LLM */
export const REVIEW_USER_NOTE_QUESTION = 'Что ты считаешь главным итогом недели, если сказать одной строкой?';

/** Time options for notification settings */
export const NOTIFICATION_TIMES = ['08:00', '14:00', '20:00'] as const;

/** Settings */
export const SETTINGS_NOTIFICATIONS = 'Уведомления';
export const SETTINGS_PLAN = 'План';
export const SETTINGS_FIXATION = 'Фиксация';
export const SETTINGS_REVIEW = 'Обзор';
export const SETTINGS_TIMEZONE = 'Часовой пояс';
export const SETTINGS_TIME_INPUT_QUESTION = 'Введите время (ЧЧ:ММ), например 14:30:';
export const SETTINGS_TIME_INVALID = '❌ Неверный формат. Введите время ЧЧ:ММ (например 14:30).';
