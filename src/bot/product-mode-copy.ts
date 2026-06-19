import type { ProductMode } from '../services/product-mode.js';
import { productModeLabel } from '../services/product-mode.js';

export const PRODUCT_MODE_PICKER_TEXT =
  'Выбери режим работы:\n\n' +
  '<b>Founder Mode</b> — недельный приоритет, ежедневная фиксация, отчёт.\n\n' +
  '<b>Closure</b> — одно отложенное дело на неделю, ежедневный шаг, дайджест.';

export const PRODUCT_MODE_PICK_FIRST = 'Сначала выбери режим: /start';

export function wrongProductModeHint(actual: ProductMode | null, required: ProductMode): string {
  const requiredLabel = productModeLabel(required);
  if (!actual) return PRODUCT_MODE_PICK_FIRST;
  return `Эта команда для ${requiredLabel}. Сменить режим: /settings`;
}

export const PRODUCT_MODE_SWITCHED_FOUNDER = 'Режим: Founder Mode.';
export const PRODUCT_MODE_SWITCHED_CLOSURE = 'Режим: Closure.';

export const SETTINGS_PRODUCT_MODE = 'Режим';
