import type { ProductMode } from '../services/product-mode.js';
import { isEngineMode } from '../services/product-mode.js';
import { getModeConfig } from '../modes/registry.js';

export function notificationCopyForMode(mode: ProductMode | null) {
  if (isEngineMode(mode)) {
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
  return {
    declarationCallback: 'notify_declaration',
    stepCallback: 'notify_fixation',
    digestCallback: 'notify_report',
    declarationText: '⏰ Время declaration недели',
    stepText: '⏰ Время фиксации',
    digestText: '⏰ Время report недели',
  };
}
