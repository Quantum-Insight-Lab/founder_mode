import type { BotContext } from '../context.js';
import type { Pool } from 'pg';

export interface HandlerDeps {
  pool: Pool;
  getUserByTgId: (tgId: string) => Promise<{ user_id: string } | null>;
  markOnboarded: (userId: string) => Promise<void>;
  ensureUser: (tgId: string) => Promise<string>;
  getReflectDate: (userId: string, choice: 'yesterday' | 'today') => Promise<string>;
  formatErrorForUser: (err: unknown) => string;
  handleLlmReply: (
    ctx: BotContext,
    rawPost: string,
    userId: string,
    context: 'plan' | 'reflect' | 'review'
  ) => Promise<void>;
  countRows: (p: Pool, query: string, params?: unknown[]) => Promise<number>;
  planService: ReturnType<typeof import('../../services/plan-service.js').createPlanService>;
  reflectionService: ReturnType<typeof import('../../services/reflection-service.js').createReflectionService>;
  reviewService: ReturnType<typeof import('../../services/review-service.js').createReviewService>;
  settingsService: ReturnType<typeof import('../../services/settings-service.js').createSettingsService>;
  showSettingsMenu: (ctx: BotContext, userId: string) => Promise<void>;
}
