import type { ModeConfig } from './types.js';

export const jobhuntConfig: ModeConfig = {
  key: 'jobhunt',
  label: 'Job hunt',
  picker: {
    title: 'Job hunt',
    description: 'Цель поиска на неделю, ежедневный шаг, итог воронки словами.',
  },
  onboarding: {
    msgs: [
      'Job hunt — для поиска работы без хаоса.',
      'Ставишь цель на неделю и каждый день делаешь один шаг по поиску.',
      'В воскресенье — recap: что сдвинулось в воронке.',
    ],
    ctaQuestion: 'Попробуем цель поиска на этой неделе?',
    intro:
      'Команды:\n' +
      '/focus — цель недели\n' +
      '/log — шаг дня\n' +
      '/recap — итог недели\n' +
      '/pivot — сменить цель\n' +
      '/settings — настройки\n' +
      '/delete — удалить данные',
    afterTzPrompt: 'Когда будешь готов — /focus и поставь цель на эту неделю.',
    afterFocusHint: 'Цель зафиксирована. Каждый день — /log: что сделал по поиску.',
    afterLogHint: 'В воскресенье — /recap: срез воронки за неделю.',
    afterRecapHint: 'Первый recap готов. Так видно, где движение, а где застой.',
  },
  commitment: {
    titleQuestion: 'Какая цель поиска работы на эту неделю?',
    followups: [
      { key: 'target_role', text: 'Какую роль / тип позиции ищешь?' },
      { key: 'why_now', text: 'Почему именно сейчас?' },
      { key: 'week_plan', text: 'Что конкретно сделаешь? (отклики, собесы, нетворк — словами)' },
    ],
    areaOtherQuestion: '',
    llmPromptKey: 'jobhuntCommitment',
    lockHint: '⚠️ На этой неделе уже есть шаги. Сменить цель: /pivot',
    preparingText: 'Собираю формулировку цели…',
  },
  switchFlow: {
    questions: [
      { key: 'reason', text: 'Почему меняешь цель?' },
      { key: 'new_title', text: 'Какая новая цель до конца недели?' },
      { key: 'new_target', text: 'Что сделаешь к концу недели?' },
    ],
    llmPromptKey: 'jobhuntSwitch',
    preparingText: 'Собираю карточку смены цели…',
  },
  daily: {
    dateQuestion: 'За какой день шаг?',
    skipHint: '💡 Пропустил день? Напоминания помогут не забывать.',
    movementQuestion: 'Был шаг по поиску сегодня?',
    branches: {
      yes: [
        { key: 'what_moved', text: 'Что сделал? (отклики, контакты, подготовка)' },
        { key: 'tomorrow_step', text: 'Шаг на завтра?' },
      ],
      no: [
        { key: 'what_stopped', text: 'Что помешало?' },
        { key: 'avoidance', text: 'Чем отвлекался?' },
        { key: 'tomorrow_step', text: 'Микро-шаг на завтра? (<15 мин)' },
      ],
      partial: [
        { key: 'what_moved', text: 'Что успел сделать?' },
        { key: 'why_partial', text: 'Почему шаг получился частичным?' },
        { key: 'tomorrow_step', text: 'Шаг на завтра?' },
      ],
    },
    llmPromptKey: 'jobhuntDaily',
    preparingText: 'Собираю карточку дня…',
    needFocusHint: 'Сначала поставь цель недели: /focus',
  },
  digest: {
    llmPromptKey: 'jobhuntDigest',
    preparingText: 'Собираю recap недели…',
    needFocusHint: 'Нужна цель недели для recap. Напиши /focus',
    needLogsHint: 'Сначала отметь хотя бы один шаг. Напиши /log',
  },
  settings: { commitLabel: 'Цель', dailyLabel: 'Шаг', digestLabel: 'Recap' },
  notifications: {
    focusText: '⏰ Время поставить цель недели',
    logText: '⏰ Время шага по поиску',
    recapText: '⏰ Время recap недели',
    focusCallback: 'notify_focus',
    logCallback: 'notify_log',
    recapCallback: 'notify_recap',
  },
  idleReply:
    '/focus — цель недели\n' +
    '/log — шаг дня\n' +
    '/recap — итог недели\n' +
    '/pivot — сменить цель\n' +
    '/settings — настройки',
  card: { commitTitle: 'Цель недели', dailyTitle: 'Шаг', digestTitle: 'Recap' },
};
