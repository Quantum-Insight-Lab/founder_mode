-- Founder Mode: Result Report read model
CREATE TABLE IF NOT EXISTS weekly_result_reports (
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
