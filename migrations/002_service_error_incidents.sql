-- Инциденты сервисных ошибок (для уведомления пользователя после исправления).

CREATE TABLE IF NOT EXISTS service_error_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  channel VARCHAR(16) NOT NULL CHECK (channel IN ('telegram', 'max')),
  context VARCHAR(64) NOT NULL,
  error_message TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_error_incidents_open ON service_error_incidents (user_id)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_service_error_incidents_created ON service_error_incidents (created_at DESC);
