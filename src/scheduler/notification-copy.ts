import type { ProductMode } from '../services/product-mode.js';
import { isEngineMode } from '../services/product-mode.js';
import { getModeConfig } from '../modes/registry.js';

export function notificationCopyForMode(mode: ProductMode | null) {
  if (!isEngineMode(mode)) {
    return {
      declarationCallback: 'notify_focus',
      stepCallback: 'notify_log',
      digestCallback: 'notify_recap',
      declarationText: '⏰ Время выбрать фокус недели',
      stepText: '⏰ Время отметить день',
      digestText: '⏰ Время recap недели',
    };
  }
  const config = getModeConfig(mode);
  return {
    declarationCallback: config.notifications.focusCallback,
    stepCallback: config.notifications.logCallback,
    digestCallback: config.notifications.recapCallback,
    declarationText: config.notifications.focusText,
    stepText: config.notifications.logText,
    digestText: config.notifications.recapText,
  };
}
