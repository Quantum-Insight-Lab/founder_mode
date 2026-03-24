import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, 'prompts');

function loadPrompt(name: string): string {
  return readFileSync(resolve(PROMPTS_DIR, `${name}.md`), 'utf-8');
}

export const prompts = {
  weeklyPlan: (dayName: string) =>
    loadPrompt('WEEKLY_PLAN_SYSTEM_PROMPT').replace(/<День недели>/g, dayName),
  weeklyDeclaration: (dayName: string) =>
    loadPrompt('WEEKLY_DECLARATION_SYSTEM_PROMPT').replace(/<День недели>/g, dayName),
  dailyFixation: () => loadPrompt('DAILY_FIXATION_SYSTEM_PROMPT'),
  executionLog: (dayName: string) =>
    loadPrompt('EXECUTION_LOG_SYSTEM_PROMPT').replace(/<День недели>/g, dayName),
  weeklyReview: (dayName: string) =>
    loadPrompt('WEEKLY_REVIEW_SYSTEM_PROMPT').replace(/<День недели>/g, dayName),
  weeklyReviewSoft: (dayName: string) =>
    loadPrompt('WEEKLY_REVIEW_SOFT_PROMPT').replace(/<День недели>/g, dayName),
  weeklyReport: (dayName: string, weekId: string) =>
    loadPrompt('WEEKLY_REPORT_SYSTEM_PROMPT')
      .replace(/<День недели>/g, dayName)
      .replace(/<week_id>/g, weekId),
  weeklyReset: (dayName: string) =>
    loadPrompt('WEEKLY_RESET_SYSTEM_PROMPT').replace(/<День недели>/g, dayName),
};
