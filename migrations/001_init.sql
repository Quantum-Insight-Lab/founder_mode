-- Founder Mode: PDA Event Core + Read Models
-- Полная начальная схема (единственный файл миграции). Чистая БД: применить этот файл.

-- Events (append-only, PDA 4.4)
CREATE TABLE IF NOT EXISTS events (
  event_id UUID PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  actor_role VARCHAR(32) NOT NULL DEFAULT 'user',
  subject_entity VARCHAR(64) NOT NULL,
  subject_id VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  causation_id UUID,
  correlation_id UUID,
  idempotency_key VARCHAR(256),
  schema_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred ON events(occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency ON events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Users (user_id = internal ID; tg_id / max_id = platform IDs, at least one required)
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id VARCHAR(64) UNIQUE NULL,
  max_id VARCHAR(64) UNIQUE NULL,
  onboarding_completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_at_least_one_channel CHECK (tg_id IS NOT NULL OR max_id IS NOT NULL)
);

-- User settings (timezone, notifications, review question)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  timezone VARCHAR(64),
  skip_review_user_note BOOLEAN NOT NULL DEFAULT false,
  notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  plan_notify_day INT,
  plan_notify_time VARCHAR(5),
  fixation_notify_days VARCHAR(32),
  fixation_notify_time VARCHAR(5),
  review_notify_day INT,
  review_notify_time VARCHAR(5),
  last_plan_notify_week_id VARCHAR(32),
  last_fixation_notify_date DATE,
  last_review_notify_week_id VARCHAR(32),
  skip_hint_shown_at TIMESTAMPTZ,
  fixation_onboarding_hint_shown_at TIMESTAMPTZ NULL,
  onboarding_review_invite_sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weeks (reference for day_range)
CREATE TABLE IF NOT EXISTS weeks (
  id VARCHAR(32) PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly plans (read model)
CREATE TABLE IF NOT EXISTS weekly_plans (
  user_id UUID NOT NULL REFERENCES users(user_id),
  week_id VARCHAR(32) NOT NULL,
  current_state TEXT,
  main_focus TEXT NOT NULL,
  weekly_result TEXT NOT NULL,
  week_failure TEXT,
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_id)
);

-- Weekly declarations (read model)
CREATE TABLE IF NOT EXISTS weekly_declarations (
  user_id UUID NOT NULL REFERENCES users(user_id),
  week_id VARCHAR(32) NOT NULL,
  main_focus TEXT NOT NULL,
  win_result TEXT NOT NULL,
  week_failure TEXT NOT NULL,
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_id)
);

-- Weekly reports (read model)
CREATE TABLE IF NOT EXISTS weekly_reports (
  user_id UUID NOT NULL REFERENCES users(user_id),
  week_id VARCHAR(32) NOT NULL,
  result_status TEXT NOT NULL,
  result_fact TEXT NOT NULL,
  main_gap TEXT NOT NULL,
  next_step TEXT NOT NULL,
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_id)
);

-- Daily fixations (read model, INV-001: unique user_id, date)
CREATE TABLE IF NOT EXISTS daily_fixations (
  user_id UUID NOT NULL REFERENCES users(user_id),
  date DATE NOT NULL,
  day VARCHAR(16) NOT NULL,
  had_movement BOOLEAN NOT NULL,
  movement_branch VARCHAR(32),
  what_moved TEXT,
  tomorrow_step TEXT,
  what_stopped TEXT,
  attention_sink TEXT,
  thought_of_day TEXT NOT NULL,
  raw_post TEXT NOT NULL,
  why_partial TEXT,
  new_focus TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

-- Weekly reviews (read model)
CREATE TABLE IF NOT EXISTS weekly_reviews (
  user_id UUID NOT NULL REFERENCES users(user_id),
  week_id VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_id)
);

-- LLM calls (audit, INV-006)
CREATE TABLE IF NOT EXISTS llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  model VARCHAR(64) NOT NULL,
  tokens_in INT NOT NULL,
  tokens_out INT NOT NULL,
  latency_ms INT NOT NULL,
  trace_id VARCHAR(64),
  idempotency_key VARCHAR(256),
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_calls_idempotency ON llm_calls(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Idempotency cache (INV-006)
CREATE TABLE IF NOT EXISTS idempotency_cache (
  idempotency_key VARCHAR(256) PRIMARY KEY,
  content TEXT NOT NULL,
  tokens_in INT NOT NULL,
  tokens_out INT NOT NULL,
  latency_ms INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
