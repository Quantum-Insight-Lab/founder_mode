import type { Pool } from 'pg';
import type { AppContext, Channel } from '../transport/types.js';
import type { ProductMode } from '../../services/product-mode.js';

export type { Channel };

export interface HandlerDeps {
  pool: Pool;
  getUserByTgId: (tgId: string) => Promise<{ user_id: string } | null>;
  getUserByMaxId: (maxId: string) => Promise<{ user_id: string } | null>;
  markOnboarded: (userId: string) => Promise<void>;
  ensureUser: (channel: Channel, externalId: string) => Promise<string>;
  getLogDate: (userId: string, choice: 'yesterday' | 'today') => Promise<string>;
  formatErrorForUser: (err: unknown) => string;
  replyWithServiceError: (ctx: AppContext, err: unknown, userId: string, context: string) => Promise<void>;
  handleLlmReply: (ctx: AppContext, rawPost: string, userId: string, context: string) => Promise<void>;
  countRows: (p: Pool, query: string, params?: unknown[]) => Promise<number>;
  engineServices: ReturnType<typeof import('../../services/engine/index.js').createEngineServices>;
  settingsService: ReturnType<typeof import('../../services/settings-service.js').createSettingsService>;
  showSettingsMenu: (ctx: AppContext, userId: string) => Promise<void>;
  showNotificationsSettingsMenu: (ctx: AppContext, userId: string) => Promise<void>;
  saveUploadedAvatar: (userId: string, bytes: Buffer, mime?: string | null) => Promise<void>;
  resolveAvatarBackgroundImage: (ctx: AppContext, userId: string) => Promise<string>;
  getRhythmLineForCard: (userId: string) => Promise<string | null>;
  getUserProductMode: (userId: string) => Promise<ProductMode | null>;
  setUserProductMode: (userId: string, mode: ProductMode) => Promise<void>;
}
