-- Engine-only schema: event store + engine read models + core tables.

-- Events (append-only)
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

-- Users
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id VARCHAR(64) UNIQUE NULL,
  max_id VARCHAR(64) UNIQUE NULL,
  onboarding_started_at TIMESTAMPTZ NULL,
  onboarding_completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_at_least_one_channel CHECK (tg_id IS NOT NULL OR max_id IS NOT NULL)
);

-- User settings (notify columns reused as focus/log/recap)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  product_mode VARCHAR(16),
  timezone VARCHAR(64),
  notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  declaration_notify_day INT,
  declaration_notify_time VARCHAR(5),
  fixation_notify_days VARCHAR(32),
  fixation_notify_time VARCHAR(5),
  report_notify_day INT,
  report_notify_time VARCHAR(5),
  last_declaration_notify_week_id VARCHAR(32),
  last_fixation_notify_date DATE,
  last_report_notify_week_id VARCHAR(32),
  skip_hint_shown_at TIMESTAMPTZ,
  avatar_mode VARCHAR(16) NOT NULL DEFAULT 'messenger',
  avatar_storage_key TEXT,
  avatar_mime VARCHAR(64),
  avatar_width INT,
  avatar_height INT,
  avatar_updated_at TIMESTAMPTZ,
  avatar_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_settings_avatar_mode_check CHECK (avatar_mode IN ('uploaded', 'messenger', 'default')),
  CONSTRAINT user_settings_product_mode_check CHECK (
    product_mode IS NULL OR product_mode IN ('learning', 'jobhunt', 'work', 'quit', 'startup', 'closure')
  )
);

-- Weeks (reference)
CREATE TABLE IF NOT EXISTS weeks (
  id VARCHAR(32) PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Engine read models
CREATE TABLE IF NOT EXISTS engine_commitments (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mode VARCHAR(16) NOT NULL,
  week_id VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mode, week_id)
);

CREATE TABLE IF NOT EXISTS engine_switches (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mode VARCHAR(16) NOT NULL,
  week_id VARCHAR(32) NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mode, week_id)
);

CREATE TABLE IF NOT EXISTS engine_steps (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mode VARCHAR(16) NOT NULL,
  date DATE NOT NULL,
  day VARCHAR(16) NOT NULL,
  movement_branch VARCHAR(16) NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mode, date)
);

CREATE TABLE IF NOT EXISTS engine_digests (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mode VARCHAR(16) NOT NULL,
  week_id VARCHAR(32) NOT NULL,
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mode, week_id)
);

-- Rhythm snapshots (cross-mode)
CREATE TABLE IF NOT EXISTS rhythm_snapshots (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  score SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
  flow NUMERIC(5, 4) NOT NULL,
  completion NUMERIC(5, 4) NOT NULL,
  stability NUMERIC(5, 4) NOT NULL,
  has_report_current_or_previous_week BOOLEAN NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, as_of_date)
);

-- LLM audit
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

-- Idempotency cache
CREATE TABLE IF NOT EXISTS idempotency_cache (
  idempotency_key VARCHAR(256) PRIMARY KEY,
  content TEXT NOT NULL,
  tokens_in INT NOT NULL,
  tokens_out INT NOT NULL,
  latency_ms INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
