/** Row types for SELECT results (match migration schema) */
export interface EventsRow {
  event_id: string;
  event_type: string;
  occurred_at: Date | string;
  actor_id: string;
  actor_role: string | null;
  subject_entity: string;
  subject_id: string;
  payload: unknown;
  causation_id: string | null;
  correlation_id: string | null;
  idempotency_key: string | null;
  schema_version: number;
}

export interface WeeklyPlanRow {
  user_id: string;
  week_id: string;
  current_state: string | null;
  main_focus: string;
  weekly_result: string;
  week_failure: string | null;
  raw_post: string;
}

export interface DailyReflectionRow {
  user_id: string;
  date: string;
  day: string;
  had_movement: boolean;
  movement_branch: string | null;
  what_moved: string | null;
  tomorrow_step: string | null;
  what_stopped: string | null;
  attention_sink: string | null;
  thought_of_day: string;
  raw_post: string;
  why_partial: string | null;
  new_focus: string | null;
}
