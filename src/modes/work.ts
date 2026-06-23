import type { ModeConfig } from './types.js';

export const workConfig: ModeConfig = {
  key: 'work',
  label: 'Work',
  picker: {
    title: 'Work Mode',
    description: 'Одна рабочая задача на неделю, ежедневный прогресс, итог недели.',
  },
  onboarding: {
    msgs: [
      'Work Mode — для исполнителя: довести одну задачу до результата за неделю.',
      'Фиксируешь задачу и каждый день отмечаешь прогресс — включая блокеры и ожидания.',
      'В воскресенье — recap: что доставлено, где застряло, что дальше.',
    ],
    ctaQuestion: 'Попробуем одну рабочую задачу на этой неделе?',
    intro:
      'Команды:\n' +
      '/focus — задача недели\n' +
      '/log — прогресс дня\n' +
      '/recap — итог недели\n' +
      '/pivot — сменить задачу\n' +
      '/settings — настройки\n' +
      '/delete — удалить данные',
    afterTzPrompt: 'Когда будешь готов — /focus и выбери задачу на эту неделю.',
    afterFocusHint: 'Задача зафиксирована. Каждый день — /log: что продвинул и что на завтра.',
    afterLogHint: 'В воскресенье — /recap: что доставлено и где застряло.',
    afterRecapHint: 'Первый recap готов. Так видно прогресс и блокеры.',
  },
  commitment: {
    titleQuestion: 'Какую рабочую задачу доводишь до результата на этой неделе?',
    followups: [
      { key: 'definition_of_done', text: 'Что значит «готово»? Конкретный результат.' },
      { key: 'why_now', text: 'Почему именно это сейчас в приоритете?' },
      { key: 'main_risk', text: 'Что может застопорить? (зависимости, согласования)' },
    ],
    llmPromptKey: 'workCommitment',
    lockHint: '⚠️ На этой неделе уже есть записи прогресса. Сменить задачу: /pivot',
    preparingText: 'Собираю формулировку задачи…',
  },
  switchFlow: {
    questions: [
      { key: 'reason', text: 'Почему меняешь задачу?' },
      { key: 'new_title', text: 'Какая новая задача до конца недели?' },
      { key: 'new_target', text: 'Что будет сделано к концу недели?' },
    ],
    llmPromptKey: 'workSwitch',
    preparingText: 'Собираю карточку смены задачи…',
  },
  daily: {
    dateQuestion: 'За какой день прогресс?',
    skipHint: '💡 Пропустил день? Напоминания помогут не забывать.',
    movementQuestion: 'Был прогресс по задаче сегодня?',
    branches: {
      yes: [
        { key: 'what_moved', text: 'Что продвинул?' },
        { key: 'tomorrow_step', text: 'Следующий шаг на завтра?' },
      ],
      no: [
        { key: 'what_stopped', text: 'Что помешало?' },
        { key: 'blocker_kind', text: 'Внешний блок (ждёшь кого-то) или внутренний?' },
        { key: 'tomorrow_step', text: 'Микро-шаг на завтра? (<15 мин)' },
      ],
      partial: [
        { key: 'what_moved', text: 'Что успел сделать?' },
        { key: 'why_partial', text: 'Почему прогресс частичный?' },
        { key: 'tomorrow_step', text: 'Фокус на завтра?' },
      ],
    },
    llmPromptKey: 'workDaily',
    preparingText: 'Собираю карточку дня…',
    needFocusHint: 'Сначала выбери задачу недели: /focus',
  },
  digest: {
    llmPromptKey: 'workDigest',
    preparingText: 'Собираю recap недели…',
    needFocusHint: 'Нужна задача недели для recap. Напиши /focus',
    needLogsHint: 'Сначала отметь хотя бы один день прогресса. Напиши /log',
  },
  settings: { commitLabel: 'Задача', dailyLabel: 'Прогресс', digestLabel: 'Recap' },
  notifications: {
    focusText: '⏰ Время выбрать задачу недели',
    logText: '⏰ Время отметить прогресс',
    recapText: '⏰ Время recap недели',
    focusCallback: 'notify_focus',
    logCallback: 'notify_log',
    recapCallback: 'notify_recap',
  },
  idleReply:
    '/focus — задача недели\n' +
    '/log — прогресс дня\n' +
    '/recap — итог недели\n' +
    '/pivot — сменить задачу\n' +
    '/settings — настройки',
  card: { commitTitle: 'Задача недели', dailyTitle: 'Прогресс', digestTitle: 'Recap' },
};
