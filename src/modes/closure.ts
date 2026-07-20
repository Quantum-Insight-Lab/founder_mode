import type { ModeConfig } from './types.js';

export const closureConfig: ModeConfig = {
  key: 'closure',
  label: 'Closure',
  picker: {
    title: 'Closure Mode',
    description: 'Одно отложенное дело на неделю: маленькие шаги без героизма, итог в воскресенье.',
  },
  onboarding: {
    msgs: [
      'Есть дела, которые откладываются месяцами: здоровье, документы, разговоры, финансы.',
      'Здесь ты выбираешь одно такое дело на неделю и каждый день делаешь маленький шаг — без героизма.',
      'В воскресенье — recap: что сдвинулось, что мешает, куда идти дальше.',
    ],
    ctaQuestion: 'Попробуем закрыть одно отложенное дело на этой неделе?',
    intro:
      'Команды:\n' +
      '/focus — дело недели\n' +
      '/log — шаг дня\n' +
      '/recap — итог недели\n' +
      '/pivot — сменить дело\n' +
      '/settings — настройки\n' +
      '/delete — удалить данные',
    afterTzPrompt: 'Когда будешь готов — /focus и выбери одно отложенное дело на эту неделю.',
    afterFocusHint: 'Дело зафиксировано. Каждый вечер — /log: что получилось и микрошаг на завтра.',
    afterLogHint: 'В воскресенье — /recap: короткий срез недели.',
    afterRecapHint: 'Первый recap готов. Так видно, что реально двигается, а что застревает.',
    afterRecapQuestion: 'Продолжим на следующей неделе?',
  },
  commitment: {
    titleQuestion: 'Какое отложенное дело берёшь на эту неделю?',
    followups: [
      { key: 'why_postponed', text: 'Почему откладывал? Что в этом деле неприятного или тревожного?' },
      { key: 'cost_of_inaction', text: 'Что будет, если так и не закрыть?' },
      { key: 'week_target', text: 'Что будет сделано к концу недели?' },
    ],
    llmPromptKey: 'closureCommitment',
    lockHint: '⚠️ На этой неделе уже есть шаги. Сменить дело: /pivot',
    preparingText: 'Собираю формулировку дела недели…',
  },
  switchFlow: {
    questions: [
      { key: 'reason', text: 'Почему меняешь дело?' },
      { key: 'new_title', text: 'Какое новое дело до конца недели?' },
      { key: 'new_target', text: 'Что будет сделано к концу недели?' },
    ],
    llmPromptKey: 'closureSwitch',
    preparingText: 'Собираю карточку смены дела…',
  },
  daily: {
    dateQuestion: 'За какой день шаг?',
    skipHint: '💡 Пропустил день? Напоминания помогут не забывать.',
    movementQuestion: 'Сделал шаг к закрытию дела?',
    branches: {
      yes: [
        { key: 'what_moved', text: 'Что удалось сделать по делу?' },
        { key: 'tomorrow_step', text: 'Какой микрошаг на завтра? (<15 мин)' },
      ],
      no: [
        { key: 'what_stopped', text: 'Что помешало?' },
        { key: 'avoidance', text: 'Чем отвлекался вместо дела?' },
        { key: 'tomorrow_step', text: 'Какой микрошаг завтра? (<15 мин)' },
      ],
      partial: [
        { key: 'what_moved', text: 'Что удалось сделать?' },
        { key: 'why_partial', text: 'Почему шаг получился частичным?' },
        { key: 'tomorrow_step', text: 'Какой микрошаг на завтра? (<15 мин)' },
      ],
    },
    llmPromptKey: 'closureDaily',
    preparingText: 'Собираю карточку дня…',
    needFocusHint: 'Сначала выбери дело недели: /focus',
  },
  digest: {
    llmPromptKey: 'closureDigest',
    preparingText: 'Собираю recap недели…',
    needFocusHint: 'Нужно дело недели для recap. Напиши /focus',
    needLogsHint: 'Сначала отметь хотя бы один шаг. Напиши /log',
  },
  settings: { commitLabel: 'Дело', dailyLabel: 'Шаг', digestLabel: 'Recap' },
  notifications: {
    focusText: '⏰ Время выбрать дело недели',
    logText: '⏰ Время шага дня',
    recapText: '⏰ Время recap недели',
    focusCallback: 'notify_focus',
    logCallback: 'notify_log',
    recapCallback: 'notify_recap',
  },
  idleReply:
    '/focus — дело недели\n' +
    '/log — шаг дня\n' +
    '/recap — итог недели\n' +
    '/pivot — сменить дело\n' +
    '/settings — настройки',
  card: {
    commitTitle: 'Дело недели',
    dailyTitle: 'Шаг',
    digestTitle: 'Recap',
    switchTitle: 'Смена дела',
  },
};
