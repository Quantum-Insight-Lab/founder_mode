import type { ModeConfig } from './types.js';

export const learningConfig: ModeConfig = {
  key: 'learning',
  label: 'Learning',
  picker: {
    title: 'Learning Mode',
    description: 'Один навык на неделю, ежедневная практика, итог обучения.',
  },
  onboarding: {
    msgs: [
      'Learning Mode — для освоения навыка без перегруза.',
      'Выбираешь тему на неделю и каждый день делаешь короткую практику.',
      'В воскресенье — recap: что усвоил и куда двигаться дальше.',
    ],
    ctaQuestion: 'Попробуем освоить один навык на этой неделе?',
    intro:
      'Команды:\n' +
      '/focus — навык недели\n' +
      '/log — практика дня\n' +
      '/recap — итог недели\n' +
      '/pivot — сменить навык\n' +
      '/settings — настройки\n' +
      '/delete — удалить данные',
    afterTzPrompt: 'Когда будешь готов — /focus и выбери навык на эту неделю.',
    afterFocusHint: 'Навык зафиксирован. Каждый вечер — /log: что практиковал и фокус на завтра.',
    afterLogHint: 'В воскресенье — /recap: срез обучения за неделю.',
    afterRecapHint: 'Первый recap готов. Так видно, что реально усваивается.',
    afterRecapQuestion: 'Продолжим на следующей неделе?',
  },
  commitment: {
    titleQuestion: 'Какой навык или тему берёшь на эту неделю?',
    followups: [
      { key: 'why_now', text: 'Зачем осваивать это именно сейчас?' },
      { key: 'week_target', text: 'Что сможешь к концу недели?' },
      { key: 'practice_plan', text: 'Как будешь практиковаться? (формат и частота)' },
    ],
    llmPromptKey: 'learningCommitment',
    lockHint: '⚠️ На этой неделе уже есть записи практики. Сменить навык: /pivot',
    preparingText: 'Собираю формулировку навыка недели…',
  },
  switchFlow: {
    questions: [
      { key: 'reason', text: 'Почему меняешь навык?' },
      { key: 'new_title', text: 'Какой новый навык до конца недели?' },
      { key: 'new_target', text: 'Что сможешь к концу недели?' },
    ],
    llmPromptKey: 'learningSwitch',
    preparingText: 'Собираю карточку смены навыка…',
  },
  daily: {
    dateQuestion: 'За какой день практика?',
    skipHint: '💡 Пропустил день? Напоминания помогут не забывать.',
    movementQuestion: 'Практиковался сегодня?',
    branches: {
      yes: [
        { key: 'what_moved', text: 'Что освоил или отработал?' },
        { key: 'tomorrow_step', text: 'На чём сфокусируешься завтра?' },
      ],
      no: [
        { key: 'what_stopped', text: 'Что помешало?' },
        { key: 'avoidance', text: 'Чем занялся вместо практики?' },
        { key: 'tomorrow_step', text: 'Микро-практика на завтра? (<15 мин)' },
      ],
      partial: [
        { key: 'what_moved', text: 'Что успел сделать?' },
        { key: 'why_partial', text: 'Почему практика получилась частичной?' },
        { key: 'tomorrow_step', text: 'Фокус на завтра?' },
      ],
    },
    llmPromptKey: 'learningDaily',
    preparingText: 'Собираю карточку практики…',
    needFocusHint: 'Сначала выбери навык недели: /focus',
  },
  digest: {
    llmPromptKey: 'learningDigest',
    preparingText: 'Собираю recap недели…',
    needFocusHint: 'Нужен навык недели для recap. Напиши /focus',
    needLogsHint: 'Сначала отметь хотя бы одну практику. Напиши /log',
  },
  settings: { commitLabel: 'Навык', dailyLabel: 'Практика', digestLabel: 'Recap' },
  notifications: {
    focusText: '⏰ Время выбрать навык недели',
    logText: '⏰ Время практики дня',
    recapText: '⏰ Время recap недели',
    focusCallback: 'notify_focus',
    logCallback: 'notify_log',
    recapCallback: 'notify_recap',
  },
  idleReply:
    '/focus — навык недели\n' +
    '/log — практика дня\n' +
    '/recap — итог недели\n' +
    '/pivot — сменить навык\n' +
    '/settings — настройки',
  card: { commitTitle: 'Навык недели', dailyTitle: 'Практика', digestTitle: 'Recap' },
};
