import type { ModeConfig } from '../../modes/types.js';
import { areaLabel } from '../../modes/shared.js';

export function buildCommitmentUserMessage(
  config: ModeConfig,
  title: string,
  areaKey: string | null,
  areaCustom: string | null,
  answers: Record<string, string>
): string {
  const lines = [`title: ${title}`, `mode: ${config.label}`];
  if (areaKey) lines.push(`area: ${areaLabel(config.commitment.areas, areaKey, areaCustom)}`);
  for (const q of config.commitment.followups) {
    lines.push(`${q.key}: ${answers[q.key] ?? ''}`);
  }
  return lines.join('\n');
}

export function buildSwitchUserMessage(config: ModeConfig, answers: Record<string, string>): string {
  const lines = [`mode: ${config.label}`];
  for (const q of config.switchFlow.questions) {
    lines.push(`${q.key}: ${answers[q.key] ?? ''}`);
  }
  return lines.join('\n');
}

export function buildDailyUserMessage(
  config: ModeConfig,
  branch: 'yes' | 'no' | 'partial',
  answers: Record<string, string>
): string {
  const branchLabel = branch === 'yes' ? 'Да' : branch === 'no' ? 'Нет' : 'Частично';
  const lines = [`mode: ${config.label}`, `Шаг: ${branchLabel}`];
  const questions = config.daily.branches[branch];
  for (const q of questions) {
    lines.push(`${q.key}: ${answers[q.key] ?? ''}`);
  }
  return lines.join('\n');
}

export function validateEngineStepAnswers(
  branch: 'yes' | 'no' | 'partial',
  answers: Record<string, string>,
  config: ModeConfig
): void {
  const filled = (s?: string) => (s ?? '').trim().length > 0;
  for (const q of config.daily.branches[branch]) {
    if (!filled(answers[q.key])) {
      throw new Error(`Заполни: ${q.text}`);
    }
  }
}
