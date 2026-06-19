import type { ProductMode } from '../services/product-mode.js';
import { ENGINE_MODES, productModeLabel } from '../services/product-mode.js';
import { MODE_CONFIGS } from '../modes/registry.js';

const ENGINE_PICKER_LINES = ENGINE_MODES.map(
  (m) => `<b>${MODE_CONFIGS[m].picker.title}</b> — ${MODE_CONFIGS[m].picker.description}`
).join('\n\n');

export const PRODUCT_MODE_PICKER_TEXT =
  'Выбери режим работы:\n\n' +
  '<b>Founder Mode</b> — недельный приоритет, ежедневная фиксация, отчёт.\n\n' +
  '<b>Closure</b> — одно отложенное дело на неделю, ежедневный шаг, дайджест.\n\n' +
  ENGINE_PICKER_LINES;

export const PRODUCT_MODE_PICK_FIRST = 'Сначала выбери режим: /start';

export function wrongProductModeHint(actual: ProductMode | null, required: ProductMode): string {
  const requiredLabel = productModeLabel(required);
  if (!actual) return PRODUCT_MODE_PICK_FIRST;
  return `Эта команда для ${requiredLabel}. Сменить режим: /settings`;
}

export const PRODUCT_MODE_SWITCHED_FOUNDER = 'Режим: Founder Mode.';
export const PRODUCT_MODE_SWITCHED_CLOSURE = 'Режим: Closure.';

export function productModeSwitchedText(mode: ProductMode): string {
  if (mode === 'founder') return PRODUCT_MODE_SWITCHED_FOUNDER;
  if (mode === 'closure') return PRODUCT_MODE_SWITCHED_CLOSURE;
  return `Режим: ${MODE_CONFIGS[mode].label}.`;
}

export const SETTINGS_PRODUCT_MODE = 'Режим';
