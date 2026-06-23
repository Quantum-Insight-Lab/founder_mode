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
  learningCommitment: () => loadPrompt('LEARNING_COMMITMENT_SYSTEM_PROMPT'),
  learningDaily: () => loadPrompt('LEARNING_DAILY_SYSTEM_PROMPT'),
  learningDigest: () => loadPrompt('LEARNING_DIGEST_SYSTEM_PROMPT'),
  learningSwitch: () => loadPrompt('LEARNING_SWITCH_SYSTEM_PROMPT'),
  habitCommitment: () => loadPrompt('HABIT_COMMITMENT_SYSTEM_PROMPT'),
  habitDaily: () => loadPrompt('HABIT_DAILY_SYSTEM_PROMPT'),
  habitDigest: () => loadPrompt('HABIT_DIGEST_SYSTEM_PROMPT'),
  habitSwitch: () => loadPrompt('HABIT_SWITCH_SYSTEM_PROMPT'),
  jobhuntCommitment: () => loadPrompt('JOBHUNT_COMMITMENT_SYSTEM_PROMPT'),
  jobhuntDaily: () => loadPrompt('JOBHUNT_DAILY_SYSTEM_PROMPT'),
  jobhuntDigest: () => loadPrompt('JOBHUNT_DIGEST_SYSTEM_PROMPT'),
  jobhuntSwitch: () => loadPrompt('JOBHUNT_SWITCH_SYSTEM_PROMPT'),
  workCommitment: () => loadPrompt('WORK_COMMITMENT_SYSTEM_PROMPT'),
  workDaily: () => loadPrompt('WORK_DAILY_SYSTEM_PROMPT'),
  workDigest: () => loadPrompt('WORK_DIGEST_SYSTEM_PROMPT'),
  workSwitch: () => loadPrompt('WORK_SWITCH_SYSTEM_PROMPT'),
  quitCommitment: () => loadPrompt('QUIT_COMMITMENT_SYSTEM_PROMPT'),
  quitDaily: () => loadPrompt('QUIT_DAILY_SYSTEM_PROMPT'),
  quitDigest: () => loadPrompt('QUIT_DIGEST_SYSTEM_PROMPT'),
  quitSwitch: () => loadPrompt('QUIT_SWITCH_SYSTEM_PROMPT'),
  startupCommitment: () => loadPrompt('STARTUP_COMMITMENT_SYSTEM_PROMPT'),
  startupDaily: () => loadPrompt('STARTUP_DAILY_SYSTEM_PROMPT'),
  startupDigest: () => loadPrompt('STARTUP_DIGEST_SYSTEM_PROMPT'),
  startupSwitch: () => loadPrompt('STARTUP_SWITCH_SYSTEM_PROMPT'),
  closureCommitment: () => loadPrompt('MATTER_SYSTEM_PROMPT'),
  closureDaily: () => loadPrompt('STEP_SYSTEM_PROMPT'),
  closureDigest: () => loadPrompt('DIGEST_SYSTEM_PROMPT'),
  closureSwitch: () => loadPrompt('MATTER_SWITCH_SYSTEM_PROMPT'),
};
