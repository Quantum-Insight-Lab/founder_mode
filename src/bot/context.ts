import type { Context, SessionFlavor } from 'grammy';

/** Данные сессии фиксации при заполнении по веткам movement_branch */
export interface FixationSessionData {
  date?: string;
  had_movement?: boolean;
  movement_branch?: 'yes' | 'no' | 'partial';
  what_moved?: string;
  tomorrow_step?: string;
  what_stopped?: string;
  attention_sink?: string;
  why_partial?: string;
  [key: string]: string | boolean | undefined;
}

export interface SessionData {
  /** Имя для карточек (MAX): кеш, если в апдейте без полного sender (callback и т.д.). */
  maxDisplayName?: string;
  step?: string;
  declarationEditMode?: boolean; // true = ручное редактирование declaration, без LLM
  declarationAnswers?: Record<string, string>;
  changeAnswers?: Record<string, string>;
  changeEditMode?: boolean; // true = ручное редактирование change, без LLM
  reportEditMode?: boolean; // true = ручное редактирование report, без LLM
  isFirstDeclaration?: boolean; // true = первый declaration пользователя — онбординг после карточки
  fixationEditMode?: boolean; // true = ручное редактирование, без LLM
  fixationData?: FixationSessionData;
  settingsData?: {
    editing?: 'declaration' | 'fixation' | 'report' | 'avatar';
    declaration_day?: number;
    fixation_days?: string;
    report_day?: number;
    [key: string]: unknown;
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;

/** Ensures session object exists. Use in handlers that mutate session. */
export function ensureSession(ctx: BotContext | { session?: SessionData }): void {
  ctx.session ??= {};
}
