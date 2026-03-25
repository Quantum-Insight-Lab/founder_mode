import type { Pool } from 'pg';
import type { AppContext, Channel } from '../transport/types.js';

export type { Channel };

export interface HandlerDeps {
  pool: Pool;
  getUserByTgId: (tgId: string) => Promise<{ user_id: string } | null>;
  getUserByMaxId: (maxId: string) => Promise<{ user_id: string } | null>;
  markOnboarded: (userId: string) => Promise<void>;
  ensureUser: (channel: Channel, externalId: string) => Promise<string>;
  getFixationDate: (userId: string, choice: 'yesterday' | 'today') => Promise<string>;
  formatErrorForUser: (err: unknown) => string;
  handleLlmReply: (
    ctx: AppContext,
    rawPost: string,
    userId: string,
    context: 'declaration' | 'fixation' | 'report'
  ) => Promise<void>;
  countRows: (p: Pool, query: string, params?: unknown[]) => Promise<number>;
  declarationService: ReturnType<typeof import('../../services/declaration-service.js').createDeclarationService>;
  reportService: ReturnType<typeof import('../../services/report-service.js').createReportService>;
  fixationService: ReturnType<typeof import('../../services/fixation-service.js').createFixationService>;
  settingsService: ReturnType<typeof import('../../services/settings-service.js').createSettingsService>;
  showSettingsMenu: (ctx: AppContext, userId: string) => Promise<void>;
  saveUploadedAvatar: (userId: string, bytes: Buffer, mime?: string | null) => Promise<void>;
  resolveAvatarBackgroundImage: (ctx: AppContext, userId: string) => Promise<string>;
}
