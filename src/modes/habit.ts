import type { ModeConfig } from './types.js';

export const habitConfig: ModeConfig = {
  key: 'habit',
  label: 'Habit',
  picker: {
    title: 'Habit Mode',
    description: 'Одна привычка на неделю, ежедневная отметка, итог консистентности.',
  },
  onboarding: {
    msgs: [
      'Habit Mode — для одной привычки без героизма.',
      'Выбираешь привычку на неделю и каждый день отмечаешь: сделал или нет.',
      'В воскресенье — recap: насколько держался ритм.',
    ],
    ctaQuestion: 'Попробуем одну привычку на этой неделе?',
    intro:
      'Команды:\n' +
      '/focus — привычка недели\n' +
      '/log — отметка дня\n' +
      '/recap — итог недели\n' +
      '/pivot — сменить привычку\n' +
      '/settings — настройки\n' +
      '/delete — удалить данные',
    afterTzPrompt: 'Когда будешь готов — /focus и выбери привычку на эту неделю.',
    afterFocusHint: 'Привычка зафиксирована. Каждый вечер — /log: сделал сегодня или нет.',
    afterLogHint: 'В воскресенье — /recap: консистентность за неделю.',
    afterRecapHint: 'Первый recap готов. Так видно, где ритм держится, а где срывается.',
    afterRecapQuestion: 'Продолжим на следующей неделе?',
  },
  commitment: {
    titleQuestion: 'Какую привычку берёшь на эту неделю?',
    followups: [
      { key: 'trigger', text: 'Когда / после чего будешь делать? (триггер)' },
      { key: 'why_now', text: 'Зачем именно сейчас?' },
      { key: 'success_criteria', text: 'Как поймёшь, что неделя удалась? (сколько раз)' },
    ],
    llmPromptKey: 'habitCommitment',
    lockHint: '⚠️ На этой неделе уже есть отметки. Сменить привычку: /pivot',
    preparingText: 'Собираю формулировку привычки…',
  },
  switchFlow: {
    questions: [
      { key: 'reason', text: 'Почему меняешь привычку?' },
      { key: 'new_title', text: 'Какая новая привычка до конца недели?' },
      { key: 'new_target', text: 'Критерий успеха на оставшиеся дни?' },
    ],
    llmPromptKey: 'habitSwitch',
    preparingText: 'Собираю карточку смены привычки…',
  },
  daily: {
    dateQuestion: 'За какой день отметка?',
    skipHint: '💡 Пропустил день? Напоминания помогут не забывать.',
    movementQuestion: 'Сделал сегодня?',
    branches: {
      yes: [
        { key: 'what_moved', text: 'Как прошло? Что помогло?' },
        { key: 'tomorrow_step', text: 'Что сделаешь завтра для ритма?' },
      ],
      no: [
        { key: 'what_stopped', text: 'Что помешало?' },
        { key: 'avoidance', text: 'Чем заменил привычку?' },
        { key: 'tomorrow_step', text: 'Микро-шаг на завтра? (<15 мин)' },
      ],
      partial: [
        { key: 'what_moved', text: 'Что успел сделать?' },
        { key: 'why_partial', text: 'Почему получилось частично?' },
        { key: 'tomorrow_step', text: 'Шаг на завтра?' },
      ],
    },
    llmPromptKey: 'habitDaily',
    preparingText: 'Собираю карточку дня…',
    needFocusHint: 'Сначала выбери привычку недели: /focus',
  },
  digest: {
    llmPromptKey: 'habitDigest',
    preparingText: 'Собираю recap недели…',
    needFocusHint: 'Нужна привычка недели для recap. Напиши /focus',
    needLogsHint: 'Сначала отметь хотя бы один день. Напиши /log',
  },
  settings: { commitLabel: 'Привычка', dailyLabel: 'Отметка', digestLabel: 'Recap' },
  notifications: {
    focusText: '⏰ Время выбрать привычку недели',
    logText: '⏰ Время отметки дня',
    recapText: '⏰ Время recap недели',
    focusCallback: 'notify_focus',
    logCallback: 'notify_log',
    recapCallback: 'notify_recap',
  },
  idleReply:
    '/focus — привычка недели\n' +
    '/log — отметка дня\n' +
    '/recap — итог недели\n' +
    '/pivot — сменить привычку\n' +
    '/settings — настройки',
  card: { commitTitle: 'Привычка недели', dailyTitle: 'Отметка', digestTitle: 'Recap' },
};
