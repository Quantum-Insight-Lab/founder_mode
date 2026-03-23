import type { Bot, Context, SessionFlavor } from 'grammy';

/** Данные сессии рефлексии при заполнении по веткам movement_branch */
export interface FixationSessionData {
  date?: string;
  had_movement?: boolean;
  movement_branch?: 'yes' | 'no' | 'partial' | 'week_closed';
  what_moved?: string;
  tomorrow_step?: string;
  what_stopped?: string;
  attention_sink?: string;
  thought_of_day?: string;
  why_partial?: string;
  new_focus?: string;
  [key: string]: string | boolean | undefined;
}

export interface SessionData {
  step?: string;
  declarationEditMode?: boolean; // true = ручное редактирование declaration, без LLM
  declarationAnswers?: Record<string, string>;
  reportEditMode?: boolean; // true = ручное редактирование report, без LLM
  reportAnswers?: Record<string, string>;
  planEditMode?: boolean; // true = ручное редактирование, без LLM
  planningAnswers?: Record<string, string>;
  isFirstPlanning?: boolean; // true = первый план пользователя, показываем подсказку у main_focus
  isFirstDeclaration?: boolean; // true = первый declaration пользователя — онбординг после карточки
  fixationEditMode?: boolean; // true = ручное редактирование, без LLM
  fixationPromptVariant?: 'v1' | 'v2';
  fixationData?: FixationSessionData;
  settingsData?: {
    editing?: 'plan' | 'fixation' | 'review';
    plan_day?: number;
    fixation_days?: string;
    review_day?: number;
    [key: string]: unknown;
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;

/** Ensures session object exists. Use in handlers that mutate session. */
export function ensureSession(ctx: BotContext | { session?: SessionData }): void {
  ctx.session ??= {};
}
