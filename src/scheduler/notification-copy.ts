import type { ProductMode } from '../services/product-mode.js';
import { isClosureProductMode } from '../services/product-mode.js';

export function notificationCopyForMode(mode: ProductMode | null) {
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
