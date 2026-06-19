import type { LlmPromptKey } from '../../modes/types.js';
import { prompts } from '../../llm/prompts.js';

export function resolveEnginePrompt(key: LlmPromptKey): string {
  return prompts[key]();
}
