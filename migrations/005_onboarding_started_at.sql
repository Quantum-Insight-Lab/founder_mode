-- Track onboarding started moment separately from completion.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ NULL;

