import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, 'prompts');

function loadPrompt(name: string): string {
  return readFileSync(resolve(PROMPTS_DIR, `${name}.md`), 'utf-8');
}

export const prompts = {
  weeklyDeclaration: () => loadPrompt('WEEKLY_DECLARATION_SYSTEM_PROMPT'),
  priorityChange: () => loadPrompt('PRIORITY_CHANGE_SYSTEM_PROMPT'),
  dailyFixation: () => loadPrompt('DAILY_FIXATION_SYSTEM_PROMPT'),
  weeklyReport: () => loadPrompt('WEEKLY_REPORT_SYSTEM_PROMPT'),
  matter: () => loadPrompt('MATTER_SYSTEM_PROMPT'),
  matterSwitch: () => loadPrompt('MATTER_SWITCH_SYSTEM_PROMPT'),
  step: () => loadPrompt('STEP_SYSTEM_PROMPT'),
  digest: () => loadPrompt('DIGEST_SYSTEM_PROMPT'),
};
