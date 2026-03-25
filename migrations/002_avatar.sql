-- Avatar settings and metadata for local avatar uploads.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS avatar_mode VARCHAR(16) NOT NULL DEFAULT 'messenger',
  ADD COLUMN IF NOT EXISTS avatar_storage_key TEXT,
  ADD COLUMN IF NOT EXISTS avatar_mime VARCHAR(64),
  ADD COLUMN IF NOT EXISTS avatar_width INT,
  ADD COLUMN IF NOT EXISTS avatar_height INT,
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avatar_version INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_settings_avatar_mode_check'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_avatar_mode_check
      CHECK (avatar_mode IN ('uploaded', 'messenger', 'default'));
  END IF;
END
$$;
