-- Backfill for driver-playbook.sql — the original migration's
-- `CREATE TABLE IF NOT EXISTS user_preferences (...)` was a no-op against
-- production because a different `user_preferences` table already existed
-- (safety-matching's shape: gender prefs, ratings, matching_priority, etc.).
-- So the three columns the playbook code depends on never landed.
--
-- Applied: 2026-04-24 to production branch (still-rain-53751745, neondb).
-- Feature flag driver_playbook = ON (100%) at apply time — these columns
-- are load-bearing for /api/driver/preferences PATCH, /driver/dashboard
-- checklist read, and /api/cron/driver-nudges filter.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS hide_tips BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS checklist_dismissed_at TIMESTAMPTZ;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS playbook_last_viewed_at TIMESTAMPTZ;
