import type { ModeArea } from './types.js';

export const ENGINE_TIMEZONE_QUESTION =
  'Какой у тебя сейчас локальный час? Напиши время в формате ЧЧ:ММ (например 14:30).';

export const ENGINE_TIMEZONE_INVALID =
  '❌ Не смог распознать время. Часовой пояс установлен по умолчанию: <b>UTC+3</b>.\n\n' +
  'Напоминания не включены — настрой их в /settings, когда будешь готов.';

export const ENGINE_TIMEZONE_DEFAULT = 'UTC+3';

export const ENGINE_REMINDERS_ENABLED = 'Напоминания включены.';
export const ENGINE_REMINDERS_DISABLED_SHORT = 'Напоминания отключены. Включить можно в /settings.';
export const ENGINE_AFTER_CTA_YES = 'Хорошо. Сначала часовой пояс — чтобы напоминания приходили вовремя.';
export const FLOW_CHOICE_USE_BUTTONS_HINT =
  '❌ Сначала нажми «Показать» или «Изменить» под предыдущим сообщением.';

export function areaLabel(areas: ModeArea[] | undefined, areaKey: string, areaCustom?: string | null): string {
  if (areaKey === 'other') {
    const custom = (areaCustom ?? '').trim();
    return custom || 'Другое';
  }
  return areas?.find((a) => a.key === areaKey)?.label ?? areaKey;
}
