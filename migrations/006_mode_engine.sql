-- Generic mode engine tables + extend product_mode

ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_product_mode_check;
ALTER TABLE user_settings
  ADD CONSTRAINT user_settings_product_mode_check
  CHECK (product_mode IS NULL OR product_mode IN ('founder', 'closure', 'learning', 'habit', 'jobhunt'));

CREATE TABLE IF NOT EXISTS engine_commitments (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  mode VARCHAR(16) NOT NULL,
  week_id VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  area_key VARCHAR(32),
  area_custom TEXT,
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
