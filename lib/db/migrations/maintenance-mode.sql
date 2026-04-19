-- Maintenance mode — singleton config + waitlist for "notify me when back" signups.
-- Applied via Neon MCP on 2026-04-19.

CREATE TABLE IF NOT EXISTS maintenance_mode (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  title TEXT NOT NULL DEFAULT 'Scheduled maintenance — back soon',
  body TEXT NOT NULL DEFAULT 'We''re heads-down making HMU the way rides SHOULD work — drivers keep more of what they earn, riders pay less than the greedy tech-billionaire platforms charge. Won''t take long. Drop your number and we''ll text you the second we''re back live.',
  expected_return_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

INSERT INTO maintenance_mode (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS maintenance_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ,
  notified_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_maintenance_waitlist_unnotified ON maintenance_waitlist(created_at) WHERE notified_at IS NULL;
