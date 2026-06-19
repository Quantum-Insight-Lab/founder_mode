import type { EngineMode } from '../services/product-mode.js';
import type { ModeConfig } from './types.js';
import { learningConfig } from './learning.js';
import { habitConfig } from './habit.js';
import { jobhuntConfig } from './jobhunt.js';

export const MODE_CONFIGS: Record<EngineMode, ModeConfig> = {
  learning: learningConfig,
  habit: habitConfig,
  jobhunt: jobhuntConfig,
};

export function getModeConfig(mode: EngineMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

export function validateModeConfigs(): string[] {
  const errors: string[] = [];
  for (const config of Object.values(MODE_CONFIGS)) {
    const keys = new Set<string>();
    for (const q of config.commitment.followups) {
      if (keys.has(q.key)) errors.push(`${config.key}: duplicate followup key ${q.key}`);
      keys.add(q.key);
    }
    for (const branch of ['yes', 'no', 'partial'] as const) {
      for (const q of config.daily.branches[branch]) {
        if (keys.has(`daily-${branch}-${q.key}`)) errors.push(`${config.key}: duplicate daily key ${q.key}`);
        keys.add(`daily-${branch}-${q.key}`);
      }
    }
  }
  return errors;
}
