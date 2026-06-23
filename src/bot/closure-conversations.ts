/** Copy and flows for Closure mode (codename: closure). */

export const CLOSURE_ONBOARDING_INTRO =
  'Команды:\n' +
  '/matter — выбрать отложенное дело на неделю\n' +
  '/switch — сменить дело\n' +
  '/step — отметить шаг дня\n' +
  '/digest — итог недели\n' +
  '/settings — настройки\n' +
  '/delete — удалить данные';

export const CLOSURE_ONBOARDING_MSG_1 =
  'Есть дела, которые откладываются месяцами: здоровье, документы, разговоры, финансы.\n\n' +
  'Не потому что «лень», а потому что неприятно или тревожно.';

export const CLOSURE_ONBOARDING_MSG_2 =
  'Здесь ты выбираешь одно такое дело на неделю и каждый день делаешь маленький шаг — без героизма.';

export const CLOSURE_ONBOARDING_MSG_3 =
  'В воскресенье — короткий дайджест: что сдвинулось, что мешает, куда идти дальше.';

export const CLOSURE_ONBOARDING_CTA_QUESTION = 'Попробуем закрыть одно отложенное дело на этой неделе?';

export const CLOSURE_ONBOARDING_AFTER_CTA_YES =
  'Хорошо. Сначала часовой пояс — чтобы напоминания приходили вовремя.';

export const CLOSURE_ONBOARDING_TIMEZONE_QUESTION =
  'Какой у тебя сейчас локальный час? Напиши время в формате ЧЧ:ММ (например 14:30).';

export const CLOSURE_ONBOARDING_TIMEZONE_INVALID =
  '❌ Не смог распознать время. Часовой пояс установлен по умолчанию: <b>UTC+3</b>.\n\n' +
  'Напоминания не включены — настрой их в /settings, когда будешь готов.';

export const CLOSURE_ONBOARDING_TIMEZONE_DEFAULT = 'UTC+3';

export const CLOSURE_ONBOARDING_AFTER_TZ_PROMPT_MATTER =
  'Когда будешь готов — напиши /matter и выбери одно отложенное дело на эту неделю.';

export const CLOSURE_ONBOARDING_REMINDERS_ENABLED = 'Напоминания включены.';

export const CLOSURE_ONBOARDING_REMINDERS_DISABLED_SHORT = 'Напоминания отключены. Включить можно в /settings.';

export const CLOSURE_ONBOARDING_CTA_LATER_FIRST_MSG =
  'Ок. Когда захочешь — /matter.\n\n' + CLOSURE_ONBOARDING_INTRO;

export const CLOSURE_ONBOARDING_CTA_YES_FINAL_MSG =
  'Отлично.\n\n' +
  'Работаем по календарной неделе (понедельник → воскресенье).\n\n' +
  CLOSURE_ONBOARDING_INTRO;

export const CLOSURE_ONBOARDING_CTA_LATER_MSG =
  'Хорошо.\n\n' +
  'Когда захочешь вернуться — начнём с нового дела.\n\n' +
  CLOSURE_ONBOARDING_INTRO;

export const CLOSURE_ONBOARDING_AFTER_MATTER_1 =
  'Дело недели зафиксировано. Каждый вечер — /step: что получилось и какой микрошаг на завтра.';

export const CLOSURE_ONBOARDING_AFTER_MATTER_2 =
  'В воскресенье — /digest: короткий срез недели.';

export const CLOSURE_MATTER_TITLE_QUESTION = 'Какое отложенное дело берёшь на эту неделю?';

export const MATTER_FOLLOWUP_QUESTIONS = [
  { key: 'why_postponed', text: 'Почему откладывал? Что в этом деле неприятного или тревожного?' },
  { key: 'cost_of_inaction', text: 'Что будет, если так и не закрыть?' },
  { key: 'week_target', text: 'Что будет сделано к концу недели?' },
] as const;

export type MatterFollowupAnswerKey = (typeof MATTER_FOLLOWUP_QUESTIONS)[number]['key'];

export type MatterAnswerKey = 'title' | MatterFollowupAnswerKey;

export const MATTER_SWITCH_QUESTIONS = [
  { key: 'reason', text: 'Почему меняешь дело?' },
  { key: 'new_title', text: 'Какое новое дело до конца недели?' },
  { key: 'new_target', text: 'Что будет сделано к концу недели?' },
] as const;

export type MatterSwitchAnswerKey = (typeof MATTER_SWITCH_QUESTIONS)[number]['key'];

export const FLOW_CHOICE_USE_BUTTONS_HINT =
  '❌ Сначала нажми «Показать» или «Изменить» под предыдущим сообщением.';

export const LLM_PREPARING_MATTER = 'Собираю формулировку дела недели…';
export const LLM_PREPARING_STEP = 'Собираю карточку дня…';
export const LLM_PREPARING_DIGEST = 'Собираю недельный дайджест…';
export const LLM_PREPARING_SWITCH = 'Собираю карточку смены дела…';

export const MATTER_EDIT_BLOCKED_HAS_STEPS =
  '⚠️ На этой неделе уже есть шаги. Дело можно изменить только через /switch.';

export const STEP_DATE_QUESTION = 'За какой день шаг?';

export const STEP_SKIP_HINT = '💡 Пропустил день? Напоминания помогут не забывать.';

export const STEP_MOVEMENT_QUESTION = 'Сделал шаг к закрытию дела?';

export const STEP_QUESTIONS_YES = [
  { key: 'what_moved', text: 'Что удалось сделать по делу?' },
  { key: 'tomorrow_step', text: 'Какой микрошаг на завтра? (<15 мин)' },
] as const;

export const STEP_QUESTIONS_NO = [
  { key: 'what_stopped', text: 'Что помешало?' },
  { key: 'avoidance', text: 'Чем отвлекался вместо дела?' },
  { key: 'tomorrow_step', text: 'Какой микрошаг завтра? (<15 мин)' },
] as const;

export const STEP_QUESTIONS_PARTIAL = [
  { key: 'what_moved', text: 'Что удалось сделать?' },
  { key: 'why_partial', text: 'Почему шаг получился частичным?' },
  { key: 'tomorrow_step', text: 'Какой микрошаг на завтра? (<15 мин)' },
] as const;

export const CLOSURE_ONBOARDING_FIRST_STEP_INTRO =
  'Каждый вечер — короткий /step: был ли прогресс и что на завтра.';

export const CLOSURE_ONBOARDING_NEXT_STEP_INTRO = 'Пора отметить шаг дня.';

export const CLOSURE_ONBOARDING_AFTER_STEP =
  'Шаг записан. Завтра — снова /step или дождись напоминания.';

export const CLOSURE_ONBOARDING_AFTER_STEP_HINT =
  'В воскресенье — /digest: что сдвинулось за неделю.';

export const CLOSURE_ONBOARDING_AFTER_DIGEST_1 =
  'Первый дайджест готов. Так видно, что реально двигается, а что застревает.';

export const CLOSURE_ONBOARDING_AFTER_DIGEST_QUESTION = 'Продолжим на следующей неделе?';

export const CLOSURE_SETTINGS_MATTER = 'Дело недели';
export const CLOSURE_SETTINGS_STEP = 'Шаг дня';
export const CLOSURE_SETTINGS_DIGEST = 'Дайджест';

export const NOTIFICATION_TIMES = ['08:00', '14:00', '20:00'] as const;

export const SETTINGS_NOTIFICATIONS = 'Напоминания';
export const SETTINGS_TIMEZONE = 'Часовой пояс';
export const SETTINGS_AVATAR = 'Аватар';
export const SETTINGS_CONFIGURE_NOTIFICATIONS = 'Настроить напоминания';
export const SETTINGS_TIME_INPUT_QUESTION = 'Введите время (ЧЧ:ММ), например 14:30:';
export const SETTINGS_TIME_INVALID = '❌ Неверный формат. Введите время ЧЧ:ММ (например 14:30).';
