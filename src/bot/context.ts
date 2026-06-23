import type { Context, SessionFlavor } from 'grammy';

export interface EngineLogSessionData {
  date?: string;
  movement_branch?: 'yes' | 'no' | 'partial';
  [key: string]: string | boolean | undefined;
}

export interface SessionData {
  maxDisplayName?: string;
  step?: string;
  engineFocusAnswers?: Record<string, string>;
  engineFocusEditMode?: boolean;
  engineLogData?: EngineLogSessionData;
  engineLogEditMode?: boolean;
  enginePivotAnswers?: Record<string, string>;
  engineRecapEditMode?: boolean;
  settingsData?: {
    editing?: 'declaration' | 'fixation' | 'report' | 'avatar';
    declaration_day?: number;
    fixation_days?: string;
    report_day?: number;
    [key: string]: unknown;
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;

export function ensureSession(ctx: BotContext | { session?: SessionData }): void {
  ctx.session ??= {};
}
