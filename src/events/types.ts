/**
 * Event types (PDA 4.4 event-sourced core).
 */
export const EVENT_TYPES = {
  DeclarationCreated: 'DeclarationCreated',
  DeclarationUpdated: 'DeclarationUpdated',
  PriorityChanged: 'PriorityChanged',
  ReportCreated: 'ReportCreated',
  ReportUpdated: 'ReportUpdated',
  FixationSubmitted: 'FixationSubmitted',
  UserRegistered: 'UserRegistered',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface Actor {
  id: string;
  role: 'user';
}

export interface Subject {
  entity: string;
  id: string;
}

interface BaseEvent {
  event_id: string;
  occurred_at: string;
  actor: Actor;
  subject: Subject;
  causation_id: string | null;
  correlation_id: string | null;
  idempotency_key: string | null;
  schema_version: 1;
}

export interface DeclarationCreatedPayload {
  user_id: string;
  week_id: string;
  main_focus: string;
  win_result: string;
  week_failure: string;
  raw_post: string;
}

export interface ReportCreatedPayload {
  user_id: string;
  week_id: string;
  raw_post: string;
}

export interface PriorityChangedPayload {
  user_id: string;
  week_id: string;
  reason: string;
  new_focus: string;
  new_win: string;
  new_failure: string;
  raw_post: string;
}

export type FixationMovementBranch = 'yes' | 'no' | 'partial' | 'week_closed';

export interface FixationSubmittedPayload {
  user_id: string;
  date: string; // YYYY-MM-DD
  day: string; // Понедельник, Вторник, ... (рус.)
  had_movement: boolean;
  movement_branch: FixationMovementBranch;
  what_moved?: string;
  tomorrow_step?: string;
  what_stopped?: string;
  attention_sink?: string;
  raw_post: string;
  why_partial?: string;
  new_focus?: string;
}

export interface UserRegisteredPayload {
  user_id: string; // UUID, internal
  tg_id?: string; // Telegram platform ID
  max_id?: string; // MAX messenger platform ID (at least one of tg_id, max_id)
}

export interface DeclarationCreatedEvent extends BaseEvent {
  event_type: 'DeclarationCreated';
  payload: DeclarationCreatedPayload;
}
export interface DeclarationUpdatedEvent extends BaseEvent {
  event_type: 'DeclarationUpdated';
  payload: DeclarationCreatedPayload;
}
export interface ReportCreatedEvent extends BaseEvent {
  event_type: 'ReportCreated';
  payload: ReportCreatedPayload;
}
export interface ReportUpdatedEvent extends BaseEvent {
  event_type: 'ReportUpdated';
  payload: ReportCreatedPayload;
}
export interface PriorityChangedEvent extends BaseEvent {
  event_type: 'PriorityChanged';
  payload: PriorityChangedPayload;
}
export interface FixationSubmittedEvent extends BaseEvent {
  event_type: 'FixationSubmitted';
  payload: FixationSubmittedPayload;
}
export interface UserRegisteredEvent extends BaseEvent {
  event_type: 'UserRegistered';
  payload: UserRegisteredPayload;
}

export type DomainEvent =
  | DeclarationCreatedEvent
  | DeclarationUpdatedEvent
  | PriorityChangedEvent
  | ReportCreatedEvent
  | ReportUpdatedEvent
  | FixationSubmittedEvent
  | UserRegisteredEvent;
