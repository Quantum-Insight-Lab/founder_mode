-- Weekly priority change (one change per user/week)
CREATE TABLE IF NOT EXISTS weekly_priority_changes (
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  week_id VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  new_focus TEXT NOT NULL,
  new_win TEXT NOT NULL,
  new_failure TEXT NOT NULL,
  raw_post TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_id)
);
