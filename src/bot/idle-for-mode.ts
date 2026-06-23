import type { ProductMode } from '../services/product-mode.js';
import { isEngineMode } from '../services/product-mode.js';
import { getModeConfig } from '../modes/registry.js';
import { IDLE_COMMAND_LIST_REPLY } from './idle-message.js';

export function idleCommandListForMode(mode: ProductMode | null): string {
  if (isEngineMode(mode)) return getModeConfig(mode).idleReply;
  return IDLE_COMMAND_LIST_REPLY;
}
