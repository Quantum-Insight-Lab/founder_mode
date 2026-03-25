/**
 * Онбординг завершён: при /start показываем цикл и команды (без кнопок).
 */
export const ONBOARDING_INTRO =
  `Добро пожаловать в Founder Mode 👋\n\n` +
  `Режим фокуса и рефлексии.\n\n` +
  `<b>Цикл:</b>\n` +
  `declaration недели → фиксация дня → report недели\n\n` +
  `Declaration задаёт фокус.\n` +
  `Фиксация — движение за день.\n` +
  `Report — срез недели.\n\n` +
  `<b>Команды:</b>\n` +
  `/declaration — зафиксировать declaration недели\n` +
  `/fixation — фиксировать день\n` +
  `/report — итог недели\n` +
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
  'Давай быстро посмотрим, что на самом деле произошло сегодня.\n\nЭто займёт около минуты.';

export const ONBOARDING_NEXT_REFLECT_INTRO =
  'Время коротко зафиксировать день. Посмотрим, было ли движение по главному.';

export const ONBOARDING_AFTER_REFLECT =
  'День зафиксирован.\n\nЗавтра проверим,\nполучится ли сделать следующий шаг.';

export const ONBOARDING_AFTER_REFLECT_HINT = '❗️ Часть эксперимента завершена.';

export const ONBOARDING_SATURDAY_REPORT_INVITE =
  'Неделя подходит к концу.\n\n' +
  'Давай соберём короткий обзор: что получилось, и куда двигаться дальше. Напиши (нажми) /report';

export const ONBOARDING_AFTER_REPORT_1 =
  '❗️ Эксперимент завершён.\n\n' +
  'Теперь у тебя есть:\n' +
  'вектор недели,\n' +
  'история ежедневного движения\n' +
  'и сжатый обзор результата.\n\n' +
  'Если захочешь очистить историю,\nможно удалить данные командой /delete.';

export const ONBOARDING_AFTER_REPORT_QUESTION = 'Хочешь продолжить следующий недельный цикл?';

export const ONBOARDING_CTA_LATER_MSG =
  'Хорошо.\n\n' +
  'Когда захочешь вернуться, мы начнём новый цикл с нового фокуса.\n\n' +
  'Founder Mode работает по календарной неделе\n(понедельник → воскресенье).\n\n' +
  'Report собирается по этому периоду.\n\n' +
  'Команды:\n' +
  '/declaration — declaration недели\n' +
  '/fixation — фиксировать день\n' +
  '/report — итог недели\n' +
  '/settings - настройки\n' +
  '/delete - удалить данные';

export const ONBOARDING_CTA_YES_FINAL_MSG =
  'Отлично.\n\n' +
  'Founder Mode работает по календарной неделе\n(понедельник → воскресенье).\n\n' +
  'Report собирается по этому периоду.\n\n' +
  'Команды:\n' +
  '/declaration — declaration недели\n' +
  '/fixation — фиксировать день\n' +
  '/report — итог недели\n' +
  '/settings - настройки\n' +
  '/delete - удалить данные';

/** Вопросы для /declaration */
export const WEEKLY_DECLARATION_QUESTIONS = [
  { key: 'main_focus', text: 'Один главный приоритет на неделю?' },
  { key: 'win_result', text: 'Какой артефакт или результат должен появиться к концу недели?' },
  { key: 'week_failure', text: 'Что будет считаться провалом недели?' },
] as const;

export type WeeklyDeclarationAnswerKey = (typeof WEEKLY_DECLARATION_QUESTIONS)[number]['key'];

/** Редактирование declaration заблокировано при наличии фиксаций в локальной неделе */
export const DECLARATION_EDIT_BLOCKED_HAS_FIXATIONS =
  '⚠️ На этой неделе уже есть фиксации дня. Declaration изменить нельзя — он задаёт контекст для уже записанных дней.';

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
  { key: 'tomorrow_step', text: 'Какой шаг по главному фокусу на завтра?' },
] as const;

export const REFLECTION_QUESTIONS_NO_MOVEMENT = [
  { key: 'what_stopped', text: 'Что остановило?' },
  { key: 'attention_sink', text: 'Что заняло основное внимание?' },
  { key: 'tomorrow_step', text: 'Как мягко вернуть вектор завтра? (одно дело <15 минут)' },
] as const;

export const REFLECTION_QUESTIONS_PARTIAL = [
  { key: 'what_moved', text: 'Что удалось сделать по главному?' },
  { key: 'why_partial', text: 'Почему движение осталось частичным?' },
  { key: 'attention_sink', text: 'Что ещё заняло внимание?' },
  { key: 'tomorrow_step', text: 'Какой шаг по главному фокусу на завтра?' },
] as const;

export const REFLECTION_QUESTIONS_WEEK_CLOSED = [
  { key: 'new_focus', text: 'Какой новый фокус выбран?' },
  { key: 'what_moved', text: 'Что удалось сделать по нему?' },
  { key: 'tomorrow_step', text: 'Какой следующий шаг на завтра?' },
] as const;

/** Time options for notification settings */
export const NOTIFICATION_TIMES = ['08:00', '14:00', '20:00'] as const;

/** Settings */
export const SETTINGS_NOTIFICATIONS = 'Уведомления';
export const SETTINGS_DECLARATION = 'Declaration';
export const SETTINGS_FIXATION = 'Фиксация';
export const SETTINGS_REPORT = 'Report';
export const SETTINGS_TIMEZONE = 'Часовой пояс';
export const SETTINGS_AVATAR = 'Аватар';
export const SETTINGS_TIME_INPUT_QUESTION = 'Введите время (ЧЧ:ММ), например 14:30:';
export const SETTINGS_TIME_INVALID = '❌ Неверный формат. Введите время ЧЧ:ММ (например 14:30).';
