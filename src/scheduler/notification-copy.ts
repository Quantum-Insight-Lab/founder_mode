import type { ProductMode } from '../services/product-mode.js';
import { isClosureProductMode, isEngineMode } from '../services/product-mode.js';
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
  const closure = isClosureProductMode(mode);
  return {
    declarationCallback: closure ? 'notify_matter' : 'notify_declaration',
    stepCallback: closure ? 'notify_step' : 'notify_fixation',
    digestCallback: closure ? 'notify_digest' : 'notify_report',
    declarationText: closure ? '⏰ Время выбрать дело недели' : '⏰ Время declaration недели',
    stepText: closure ? '⏰ Время шага дня' : '⏰ Время фиксации',
    digestText: closure ? '⏰ Время дайджеста недели' : '⏰ Время report недели',
  };
}
