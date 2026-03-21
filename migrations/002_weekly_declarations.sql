-- Founder Mode: Declaration read model
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
