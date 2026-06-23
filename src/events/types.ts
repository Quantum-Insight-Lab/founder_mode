/**
 * Event types: engine-only.
 */
export const EVENT_TYPES = {
  UserRegistered: 'UserRegistered',
  CommitmentSet: 'CommitmentSet',
  CommitmentSwitched: 'CommitmentSwitched',
  DailyStepSubmitted: 'DailyStepSubmitted',
  DigestSet: 'DigestSet',
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

export type EventSource = 'initial' | 'manual';

export interface UserRegisteredPayload {
  user_id: string;
  tg_id?: string;
  max_id?: string;
}

export interface CommitmentSetPayload {
  user_id: string;
  mode: string;
  week_id: string;
  title: string;
  answers: Record<string, string>;
  raw_post: string;
  source: EventSource;
}

export interface CommitmentSwitchedPayload {
  user_id: string;
  mode: string;
  week_id: string;
  answers: Record<string, string>;
  raw_post: string;
  source: EventSource;
}

export type EngineStepMovementBranch = 'yes' | 'no' | 'partial';

export interface DailyStepSubmittedPayload {
  user_id: string;
  mode: string;
  date: string;
  day: string;
  movement_branch: EngineStepMovementBranch;
  answers: Record<string, string>;
  raw_post: string;
  source: EventSource;
}

export interface DigestSetPayload {
  user_id: string;
  mode: string;
  week_id: string;
  raw_post: string;
  source: EventSource;
}

export interface UserRegisteredEvent extends BaseEvent {
  event_type: 'UserRegistered';
  payload: UserRegisteredPayload;
}
export interface CommitmentSetEvent extends BaseEvent {
  event_type: 'CommitmentSet';
  payload: CommitmentSetPayload;
}
export interface CommitmentSwitchedEvent extends BaseEvent {
  event_type: 'CommitmentSwitched';
  payload: CommitmentSwitchedPayload;
}
export interface DailyStepSubmittedEvent extends BaseEvent {
  event_type: 'DailyStepSubmitted';
  payload: DailyStepSubmittedPayload;
}
export interface DigestSetEvent extends BaseEvent {
  event_type: 'DigestSet';
  payload: DigestSetPayload;
}

export type DomainEvent =
  | UserRegisteredEvent
  | CommitmentSetEvent
  | CommitmentSwitchedEvent
  | DailyStepSubmittedEvent
  | DigestSetEvent;
