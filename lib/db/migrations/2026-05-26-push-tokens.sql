-- Push notification token storage
-- Synced from native app on each launch (expo-notifications)
-- push_platform discriminates APNs (ios) from FCM (android) when sending

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_token    TEXT,
  ADD COLUMN IF NOT EXISTS push_platform TEXT CHECK (push_platform IN ('ios', 'android'));

-- Fast lookup when sending targeted push (notify_user MCP tool)
CREATE INDEX IF NOT EXISTS idx_users_push_token ON users (push_token)
  WHERE push_token IS NOT NULL;
