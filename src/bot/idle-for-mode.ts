import type { ProductMode } from '../services/product-mode.js';
import { isClosureProductMode, isEngineMode } from '../services/product-mode.js';
import { getModeConfig } from '../modes/registry.js';
import { IDLE_COMMAND_LIST_REPLY } from './idle-message.js';
import { CLOSURE_IDLE_COMMAND_LIST_REPLY } from './closure-idle-message.js';

export function idleCommandListForMode(mode: ProductMode | null): string {
  if (isEngineMode(mode)) return getModeConfig(mode).idleReply;
  if (isClosureProductMode(mode)) return CLOSURE_IDLE_COMMAND_LIST_REPLY;
  return IDLE_COMMAND_LIST_REPLY;
}
