-- Closure mode: read models (independent from Founder Mode tables).

CREATE TABLE IF NOT EXISTS weekly_matters (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  week_id VARCHAR(32) NOT NULL,
  title TEXT NOT NULL,
  area_key VARCHAR(32) NOT NULL,
  area_custom TEXT,
  why_postponed TEXT NOT NULL,
  cost_of_inaction TEXT NOT NULL,
  week_target TEXT NOT NULL,
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_id)
);

CREATE TABLE IF NOT EXISTS matter_switches (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  week_id VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  new_title TEXT NOT NULL,
  new_target TEXT NOT NULL,
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_id)
);

CREATE TABLE IF NOT EXISTS matter_steps (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day VARCHAR(16) NOT NULL,
  had_movement BOOLEAN NOT NULL,
  movement_branch VARCHAR(32),
  what_moved TEXT,
  tomorrow_step TEXT,
  what_stopped TEXT,
  avoidance TEXT,
  raw_post TEXT NOT NULL,
  why_partial TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS weekly_digests (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  week_id VARCHAR(32) NOT NULL,
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_id)
);
