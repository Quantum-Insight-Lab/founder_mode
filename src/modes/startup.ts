import type { ModeConfig } from './types.js';

export const startupConfig: ModeConfig = {
  key: 'startup',
  label: 'Startup',
  picker: {
    title: 'Startup Mode',
    description: 'Один рычаг на неделю: первые пользователи, доработка продукта, привлечение инвестиций — без тонущей в операционке.',
  },
  onboarding: {
    msgs: [
      'Startup Mode — для фаундера: один рычаг на неделю, не список задач.',
      'Каждый вечер фиксируешь: двигался ли рычаг или утонул в текучке.',
      'В воскресенье — recap: что сдвинуло бизнес и куда фокус на следующую неделю.',
    ],
    ctaQuestion: 'Попробуем один рычаг на этой неделе?',
    intro:
      'Команды:\n' +
      '/focus — рычаг недели\n' +
      '/log — движение дня\n' +
      '/recap — итог недели\n' +
      '/pivot — сменить рычаг\n' +
      '/settings — настройки\n' +
      '/delete — удалить данные',
    afterTzPrompt: 'Когда будешь готов — /focus и выбери рычаг на эту неделю.',
    afterFocusHint: 'Рычаг зафиксирован. Каждый вечер — /log: было ли движение по главному.',
    afterLogHint: 'В воскресенье — /recap: срез недели по рычагу.',
    afterRecapHint: 'Первый recap готов. Так видно, где traction, а где текучка.',
    afterRecapQuestion: 'Продолжим на следующей неделе?',
  },
  commitment: {
    titleQuestion: 'Какой ОДИН рычаг двигаешь на этой неделе? (рост, первые пользователи/продажи, доработка продукта под рынок, привлечение инвестиций)',
    followups: [
      { key: 'why_lever', text: 'Почему это сейчас главный рычаг, а не текучка?' },
      { key: 'success_metric', text: 'Как поймёшь, что сдвинул? (метрика или факт словами)' },
      { key: 'week_failure', text: 'Что будет провалом недели?' },
    ],
    llmPromptKey: 'startupCommitment',
    lockHint: '⚠️ На этой неделе уже есть фиксации. Сменить рычаг: /pivot',
    preparingText: 'Собираю формулировку рычага…',
  },
  switchFlow: {
    questions: [
      { key: 'reason', text: 'Почему меняешь рычаг?' },
      { key: 'new_title', text: 'Какой новый рычаг до конца недели?' },
      { key: 'new_target', text: 'Как поймёшь, что неделя удалась?' },
    ],
    llmPromptKey: 'startupSwitch',
    preparingText: 'Собираю карточку смены рычага…',
  },
  daily: {
    dateQuestion: 'За какой день фиксация?',
    skipHint: '💡 Пропустил день? Напоминания помогут не забывать.',
    movementQuestion: 'Было ли движение по рычагу недели?',
    branches: {
      yes: [
        { key: 'what_moved', text: 'Что сдвинул по рычагу?' },
        { key: 'tomorrow_step', text: 'Шаг по рычагу на завтра?' },
      ],
      no: [
        { key: 'what_stopped', text: 'Что остановило?' },
        { key: 'attention_sink', text: 'Что заняло внимание вместо рычага? (операционка, пожары)' },
        { key: 'tomorrow_step', text: 'Как вернуть рычаг завтра? (одно дело <15 мин)' },
      ],
      partial: [
        { key: 'what_moved', text: 'Что удалось по рычагу?' },
        { key: 'why_partial', text: 'Почему движение частичное?' },
        { key: 'tomorrow_step', text: 'Шаг по рычагу на завтра?' },
      ],
    },
    llmPromptKey: 'startupDaily',
    preparingText: 'Собираю карточку дня…',
    needFocusHint: 'Сначала задай рычаг недели: /focus',
  },
  digest: {
    llmPromptKey: 'startupDigest',
    preparingText: 'Собираю recap недели…',
    needFocusHint: 'Нужен рычаг недели для recap. Напиши /focus',
    needLogsHint: 'Сначала отметь хотя бы один день. Напиши /log',
  },
  settings: { commitLabel: 'Рычаг', dailyLabel: 'Фиксация', digestLabel: 'Recap' },
  notifications: {
    focusText: '⏰ Время выбрать рычаг недели',
    logText: '⏰ Время фиксации дня',
    recapText: '⏰ Время recap недели',
    focusCallback: 'notify_focus',
    logCallback: 'notify_log',
    recapCallback: 'notify_recap',
  },
  idleReply:
    '/focus — рычаг недели\n' +
    '/log — движение дня\n' +
    '/recap — итог недели\n' +
    '/pivot — сменить рычаг\n' +
    '/settings — настройки',
  card: { commitTitle: 'Рычаг недели', dailyTitle: 'Фиксация', digestTitle: 'Recap' },
};
