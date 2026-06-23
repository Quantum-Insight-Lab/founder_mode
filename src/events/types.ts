/**
 * Event types: one type per act.
 * `source` in payload distinguishes initial creation from manual edit.
 */
export const EVENT_TYPES = {
  DeclarationSet: 'DeclarationSet',
  PriorityChanged: 'PriorityChanged',
  ReportSet: 'ReportSet',
  FixationSubmitted: 'FixationSubmitted',
  UserRegistered: 'UserRegistered',
  MatterSet: 'MatterSet',
  MatterSwitched: 'MatterSwitched',
  MatterStepSubmitted: 'MatterStepSubmitted',
  MatterDigestSet: 'MatterDigestSet',
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

export interface DeclarationSetPayload {
  user_id: string;
  week_id: string;
  main_focus: string;
  why_now: string;
  week_failure: string;
  raw_post: string;
  source: EventSource;
  /** @deprecated legacy events only */
  win_result?: string;
}

export interface ReportSetPayload {
  user_id: string;
  week_id: string;
  raw_post: string;
  source: EventSource;
}

export interface PriorityChangedPayload {
  user_id: string;
  week_id: string;
  reason: string;
  new_focus: string;
  new_win: string;
  new_failure: string;
  raw_post: string;
  source: EventSource;
}

export type FixationMovementBranch = 'yes' | 'no' | 'partial';

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
  source: EventSource;
}

export interface UserRegisteredPayload {
  user_id: string; // UUID, internal
  tg_id?: string; // Telegram platform ID
  max_id?: string; // MAX messenger platform ID (at least one of tg_id, max_id)
}

export interface MatterSetPayload {
  user_id: string;
  week_id: string;
  title: string;
  why_postponed: string;
  cost_of_inaction: string;
  week_target: string;
  raw_post: string;
  source: EventSource;
}

export interface MatterSwitchedPayload {
  user_id: string;
  week_id: string;
  reason: string;
  new_title: string;
  new_target: string;
  raw_post: string;
  source: EventSource;
}

export type MatterStepMovementBranch = 'yes' | 'no' | 'partial';

export interface MatterStepSubmittedPayload {
  user_id: string;
  date: string;
  day: string;
  had_movement: boolean;
  movement_branch: MatterStepMovementBranch;
  what_moved?: string;
  tomorrow_step?: string;
  what_stopped?: string;
  avoidance?: string;
  raw_post: string;
  why_partial?: string;
  source: EventSource;
}

export interface MatterDigestSetPayload {
  user_id: string;
  week_id: string;
  raw_post: string;
  source: EventSource;
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

export interface DeclarationSetEvent extends BaseEvent {
  event_type: 'DeclarationSet';
  payload: DeclarationSetPayload;
}
export interface ReportSetEvent extends BaseEvent {
  event_type: 'ReportSet';
  payload: ReportSetPayload;
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
export interface MatterSetEvent extends BaseEvent {
  event_type: 'MatterSet';
  payload: MatterSetPayload;
}
export interface MatterSwitchedEvent extends BaseEvent {
  event_type: 'MatterSwitched';
  payload: MatterSwitchedPayload;
}
export interface MatterStepSubmittedEvent extends BaseEvent {
  event_type: 'MatterStepSubmitted';
  payload: MatterStepSubmittedPayload;
}
export interface MatterDigestSetEvent extends BaseEvent {
  event_type: 'MatterDigestSet';
  payload: MatterDigestSetPayload;
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
  | DeclarationSetEvent
  | PriorityChangedEvent
  | ReportSetEvent
  | FixationSubmittedEvent
  | UserRegisteredEvent
  | MatterSetEvent
  | MatterSwitchedEvent
  | MatterStepSubmittedEvent
  | MatterDigestSetEvent
  | CommitmentSetEvent
  | CommitmentSwitchedEvent
  | DailyStepSubmittedEvent
  | DigestSetEvent;
