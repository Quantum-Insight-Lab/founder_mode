import type { Pool } from 'pg';
import type { AppContext } from '../transport/types.js';

export type Channel = 'telegram' | 'max';

export interface HandlerDeps {
  pool: Pool;
  getUserByTgId: (tgId: string) => Promise<{ user_id: string } | null>;
  getUserByMaxId: (maxId: string) => Promise<{ user_id: string } | null>;
  markOnboarded: (userId: string) => Promise<void>;
  ensureUser: (channel: Channel, externalId: string) => Promise<string>;
  getReflectDate: (userId: string, choice: 'yesterday' | 'today') => Promise<string>;
  formatErrorForUser: (err: unknown) => string;
  handleLlmReply: (
    ctx: AppContext,
    rawPost: string,
    userId: string,
    context: 'declaration' | 'plan' | 'reflect' | 'review' | 'result_report'
  ) => Promise<void>;
  countRows: (p: Pool, query: string, params?: unknown[]) => Promise<number>;
  declarationService: ReturnType<typeof import('../../services/declaration-service.js').createDeclarationService>;
  resultReportService: ReturnType<typeof import('../../services/result-report-service.js').createResultReportService>;
  planService: ReturnType<typeof import('../../services/plan-service.js').createPlanService>;
  reflectionService: ReturnType<typeof import('../../services/reflection-service.js').createReflectionService>;
  reviewService: ReturnType<typeof import('../../services/review-service.js').createReviewService>;
  settingsService: ReturnType<typeof import('../../services/settings-service.js').createSettingsService>;
  showSettingsMenu: (ctx: AppContext, userId: string) => Promise<void>;
}
