-- Onboarding completion and one-time hints
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ NULL;

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reflection_onboarding_hint_shown_at TIMESTAMPTZ NULL;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_review_invite_sent_at TIMESTAMPTZ NULL;
