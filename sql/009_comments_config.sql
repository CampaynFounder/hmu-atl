-- 009_comments_config.sql
-- Adds soft-delete to comments and seeds configurable comment settings.

-- 1. Soft-delete column so admin can permanently remove a comment from all views
ALTER TABLE comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_comments_not_deleted ON comments(ride_id) WHERE deleted_at IS NULL;

-- 2. Seed default comment settings.
--    maxChars:            max characters per comment (default 160)
--    maxInitialPerRide:   how many top-level comments a rider can leave per ride
--    maxRepliesPerRide:   how many replies a driver can leave per ride
INSERT INTO platform_config (config_key, config_value, updated_at)
VALUES (
  'comments.settings',
  '{"maxChars": 160, "maxInitialPerRide": 1, "maxRepliesPerRide": 1}'::jsonb,
  NOW()
)
ON CONFLICT (config_key) DO NOTHING;
