/**
 * Event types per PDA 4.4 and domain_graph.md
 */
export const EVENT_TYPES = {
  PlanCreated: 'PlanCreated',
  PlanUpdated: 'PlanUpdated',
  ReflectionSubmitted: 'ReflectionSubmitted',
  ReviewGenerated: 'ReviewGenerated',
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

export interface PlanCreatedPayload {
  user_id: string;
  week_id: string;
  current_state: string;
  main_focus: string;
  weekly_result: string;
  why_now: string;
  distractions: string;
  main_risk: string;
  raw_post: string;
}

export type ReflectionMovementBranch = 'yes' | 'no' | 'partial' | 'week_closed';

export interface ReflectionSubmittedPayload {
  user_id: string;
  date: string; // YYYY-MM-DD
  day: string; // Понедельник, Вторник, ... (рус.)
  had_movement: boolean;
  movement_branch: ReflectionMovementBranch;
  what_moved?: string;
  tomorrow_step?: string;
  what_stopped?: string;
  attention_sink?: string;
  thought_of_day: string;
  raw_post: string;
  why_partial?: string;
  new_focus?: string;
}

export interface ReviewGeneratedPayload {
  user_id: string;
  week_id: string;
  content: string;
  day_range_start: string;
  day_range_end: string;
}

export interface UserRegisteredPayload {
  user_id: string; // UUID, internal
  tg_id?: string; // Telegram platform ID
  max_id?: string; // MAX messenger platform ID (at least one of tg_id, max_id)
}

export interface PlanCreatedEvent extends BaseEvent {
  event_type: 'PlanCreated';
  payload: PlanCreatedPayload;
}
export interface PlanUpdatedEvent extends BaseEvent {
  event_type: 'PlanUpdated';
  payload: PlanCreatedPayload;
}
export interface ReflectionSubmittedEvent extends BaseEvent {
  event_type: 'ReflectionSubmitted';
  payload: ReflectionSubmittedPayload;
}
export interface ReviewGeneratedEvent extends BaseEvent {
  event_type: 'ReviewGenerated';
  payload: ReviewGeneratedPayload;
}
export interface UserRegisteredEvent extends BaseEvent {
  event_type: 'UserRegistered';
  payload: UserRegisteredPayload;
}

export type DomainEvent =
  | PlanCreatedEvent
  | PlanUpdatedEvent
  | ReflectionSubmittedEvent
  | ReviewGeneratedEvent
  | UserRegisteredEvent;
