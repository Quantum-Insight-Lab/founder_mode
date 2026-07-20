import type { ModeConfig } from './types.js';

export const quitConfig: ModeConfig = {
  key: 'quit',
  label: 'Quit',
  picker: {
    title: 'Quit Mode',
    description: 'Отказ от вредной привычки: ежедневный чек-ин, работа с триггерами, итог недели.',
  },
  onboarding: {
    msgs: [
      'Quit Mode — для отказа от вредной привычки без стыда и давления.',
      'Фиксируешь, от чего отказываешься, и каждый день отмечаешь: удержался, сорвался или сократил.',
      'В воскресенье — recap: что помогло, какие триггеры повторялись, куда двигаться дальше.',
    ],
    ctaQuestion: 'Попробуем отказ на этой неделе?',
    intro:
      'Команды:\n' +
      '/focus — обязательство недели\n' +
      '/log — чек-ин дня\n' +
      '/recap — итог недели\n' +
      '/pivot — сменить фокус\n' +
      '/settings — настройки\n' +
      '/delete — удалить данные',
    afterTzPrompt: 'Когда будешь готов — /focus и зафиксируй, от чего отказываешься на эту неделю.',
    afterFocusHint: 'Обязательство зафиксировано. Каждый день — /log: как прошёл день.',
    afterLogHint: 'В воскресенье — /recap: срез недели и триггеры.',
    afterRecapHint: 'Первый recap готов. Срыв — не конец, а данные для следующей недели.',
    afterRecapQuestion: 'Продолжим на следующей неделе?',
  },
  commitment: {
    titleQuestion: 'От чего отказываешься на этой неделе?',
    followups: [
      { key: 'why_now', text: 'Почему именно сейчас бросаешь?' },
      { key: 'main_trigger', text: 'Когда тянет сильнее всего? (ситуация, время, эмоция)' },
      { key: 'replacement', text: 'Чем заменишь в момент тяги?' },
      { key: 'week_target', text: 'Цель недели: полный отказ или сокращение? (словами)' },
    ],
    llmPromptKey: 'quitCommitment',
    lockHint: '⚠️ На этой неделе уже есть чек-ины. Сменить фокус: /pivot',
    preparingText: 'Собираю формулировку обязательства…',
  },
  switchFlow: {
    questions: [
      { key: 'reason', text: 'Почему меняешь фокус?' },
      { key: 'new_title', text: 'От чего отказываешься до конца недели?' },
      { key: 'new_target', text: 'Какая цель на оставшиеся дни?' },
    ],
    llmPromptKey: 'quitSwitch',
    preparingText: 'Собираю карточку смены фокуса…',
  },
  daily: {
    dateQuestion: 'За какой день чек-ин?',
    skipHint: '💡 Пропустил день? Напоминания помогут не забывать.',
    movementQuestion: 'Как прошёл день? (Да — удержался, Нет — сорвался, Частично — сократил)',
    branches: {
      yes: [
        { key: 'what_helped', text: 'Что помогло удержаться?' },
        { key: 'tomorrow_focus', text: 'На что обратить внимание завтра?' },
      ],
      no: [
        { key: 'trigger', text: 'Что спровоцировало срыв?' },
        { key: 'feeling_after', text: 'Что почувствовал после?' },
        { key: 'tomorrow_step', text: 'Как пройти этот триггер завтра?' },
      ],
      partial: [
        { key: 'what_count', text: 'Насколько меньше обычного? (словами)' },
        { key: 'craving_moment', text: 'Где было тяжелее всего?' },
        { key: 'tomorrow_step', text: 'Фокус на завтра?' },
      ],
    },
    llmPromptKey: 'quitDaily',
    preparingText: 'Собираю карточку дня…',
    needFocusHint: 'Сначала зафиксируй обязательство: /focus',
  },
  digest: {
    llmPromptKey: 'quitDigest',
    preparingText: 'Собираю recap недели…',
    needFocusHint: 'Нужно обязательство недели для recap. Напиши /focus',
    needLogsHint: 'Сначала отметь хотя бы один день. Напиши /log',
  },
  settings: { commitLabel: 'Отказ', dailyLabel: 'Чек-ин', digestLabel: 'Recap' },
  notifications: {
    focusText: '⏰ Время зафиксировать отказ на неделю',
    logText: '⏰ Время чек-ина дня',
    recapText: '⏰ Время recap недели',
    focusCallback: 'notify_focus',
    logCallback: 'notify_log',
    recapCallback: 'notify_recap',
  },
  idleReply:
    '/focus — обязательство недели\n' +
    '/log — чек-ин дня\n' +
    '/recap — итог недели\n' +
    '/pivot — сменить фокус\n' +
    '/settings — настройки',
  card: {
    commitTitle: 'Отказ недели',
    dailyTitle: 'Чек-ин',
    digestTitle: 'Recap',
    switchTitle: 'Смена фокуса',
  },
};
