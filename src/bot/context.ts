import type { Bot, Context, SessionFlavor } from 'grammy';

/** Данные сессии рефлексии при заполнении по веткам movement_branch */
export interface ReflectionSessionData {
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
  planEditMode?: boolean; // true = ручное редактирование, без LLM
  planningAnswers?: Record<string, string>;
  isFirstPlanning?: boolean; // true = первый план пользователя, показываем подсказку у main_focus
  reflectionEditMode?: boolean; // true = ручное редактирование, без LLM
  reflectionData?: ReflectionSessionData;
  settingsData?: {
    editing?: 'plan' | 'reflect' | 'review';
    plan_day?: number;
    reflect_days?: string;
    review_day?: number;
    [key: string]: unknown;
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;

/** Ensures session object exists. Use in handlers that mutate session. */
export function ensureSession(ctx: BotContext | { session?: SessionData }): void {
  ctx.session ??= {};
}
