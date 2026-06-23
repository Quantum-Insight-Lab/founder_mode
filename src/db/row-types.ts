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

export interface RhythmSnapshotRow {
  user_id: string;
  as_of_date: string;
  score: number;
  flow: number;
  completion: number;
  stability: number;
  has_report_current_or_previous_week: boolean;
  computed_at: Date | string;
}
