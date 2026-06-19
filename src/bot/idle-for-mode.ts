import type { ProductMode } from '../services/product-mode.js';
import { isClosureProductMode } from '../services/product-mode.js';
import { IDLE_COMMAND_LIST_REPLY } from './idle-message.js';
import { CLOSURE_IDLE_COMMAND_LIST_REPLY } from './closure-idle-message.js';

export function idleCommandListForMode(mode: ProductMode | null): string {
  if (isClosureProductMode(mode)) return CLOSURE_IDLE_COMMAND_LIST_REPLY;
  return IDLE_COMMAND_LIST_REPLY;
}
