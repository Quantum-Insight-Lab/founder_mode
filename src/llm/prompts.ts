import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, 'prompts');

function loadPrompt(name: string): string {
  return readFileSync(resolve(PROMPTS_DIR, `${name}.md`), 'utf-8');
}

export const prompts = {
  weeklyPlan: () => loadPrompt('WEEKLY_PLAN_SYSTEM_PROMPT'),
  dailyReflection: () => loadPrompt('DAILY_REFLECTION_SYSTEM_PROMPT'),
  weeklyReview: () => loadPrompt('WEEKLY_REVIEW_SYSTEM_PROMPT'),
  weeklyReviewSoft: () => loadPrompt('WEEKLY_REVIEW_SOFT_PROMPT'),
};
