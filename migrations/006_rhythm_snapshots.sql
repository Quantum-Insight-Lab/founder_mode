-- Снимки ритма (0–100 + компоненты 0..1) на локальную дату пользователя; upsert при расчёте карточки.

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
