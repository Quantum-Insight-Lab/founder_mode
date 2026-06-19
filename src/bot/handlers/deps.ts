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
  getFixationDate: (userId: string, choice: 'yesterday' | 'today') => Promise<string>;
  formatErrorForUser: (err: unknown) => string;
  /** Сервисная ошибка пользователю + запись инцидента для скрипта напоминания «исправлено». */
  replyWithServiceError: (ctx: AppContext, err: unknown, userId: string, context: string) => Promise<void>;
  handleLlmReply: (
    ctx: AppContext,
    rawPost: string,
    userId: string,
    context: 'declaration' | 'fixation' | 'report' | 'change' | 'matter' | 'step' | 'digest' | 'switch'
  ) => Promise<void>;
  countRows: (p: Pool, query: string, params?: unknown[]) => Promise<number>;
  declarationService: ReturnType<typeof import('../../services/declaration-service.js').createDeclarationService>;
  reportService: ReturnType<typeof import('../../services/report-service.js').createReportService>;
  priorityChangeService: ReturnType<typeof import('../../services/priority-change-service.js').createPriorityChangeService>;
  fixationService: ReturnType<typeof import('../../services/fixation-service.js').createFixationService>;
  matterService: ReturnType<typeof import('../../services/matter-service.js').createMatterService>;
  matterSwitchService: ReturnType<typeof import('../../services/matter-switch-service.js').createMatterSwitchService>;
  stepService: ReturnType<typeof import('../../services/step-service.js').createStepService>;
  digestService: ReturnType<typeof import('../../services/digest-service.js').createDigestService>;
  settingsService: ReturnType<typeof import('../../services/settings-service.js').createSettingsService>;
  showSettingsMenu: (ctx: AppContext, userId: string) => Promise<void>;
  showNotificationsSettingsMenu: (ctx: AppContext, userId: string) => Promise<void>;
  saveUploadedAvatar: (userId: string, bytes: Buffer, mime?: string | null) => Promise<void>;
  resolveAvatarBackgroundImage: (ctx: AppContext, userId: string) => Promise<string>;
  /** Строка «Ритм N» для подвала карточки или null (скрыть). */
  getRhythmLineForCard: (userId: string) => Promise<string | null>;
  getUserProductMode: (userId: string) => Promise<ProductMode | null>;
  setUserProductMode: (userId: string, mode: ProductMode) => Promise<void>;
}
