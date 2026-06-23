import type { ProductMode } from '../services/product-mode.js';
import { ENGINE_MODES } from '../services/product-mode.js';
import { MODE_CONFIGS } from '../modes/registry.js';

const ENGINE_PICKER_LINES = ENGINE_MODES.map(
  (m) => `<b>${MODE_CONFIGS[m].picker.title}</b> — ${MODE_CONFIGS[m].picker.description}`
).join('\n\n');

export const PRODUCT_MODE_PICKER_TEXT = 'Выбери режим работы:\n\n' + ENGINE_PICKER_LINES;

export const PRODUCT_MODE_PICK_FIRST = 'Сначала выбери режим: /start';

export function productModeSwitchedText(mode: ProductMode): string {
  return `Режим: ${MODE_CONFIGS[mode].label}.`;
}

export const SETTINGS_PRODUCT_MODE = 'Режим';
