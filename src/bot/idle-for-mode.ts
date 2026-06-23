import type { ProductMode } from '../services/product-mode.js';
import { isEngineMode } from '../services/product-mode.js';
import { getModeConfig } from '../modes/registry.js';
import { PRODUCT_MODE_PICK_FIRST } from './product-mode-copy.js';

export function idleCommandListForMode(mode: ProductMode | null): string {
  if (!isEngineMode(mode)) return PRODUCT_MODE_PICK_FIRST;
  return getModeConfig(mode).idleReply;
}
