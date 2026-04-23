-- HMU/Link feature: driver-to-rider directed interest signal + match-on-link unmasking.
-- Applied via Neon MCP on 2026-04-23 to project still-rain-53751745, main branch.
-- This file exists for repo history; DO NOT re-run — it's idempotent-ish but the tables already exist.
--
-- Feature spec: memory/hmu_link_feature_phase1.md
-- Phase 1 scope NOT in this migration (see CLAUDE.md FAST FOLLOW):
--   - 4 API routes (hmu send / link / dismiss / unlink)
--   - /driver/find-riders, /rider/linked, /rider/home HMU inbox
--   - Admin /admin/hmu-config + /admin/hmus (market-filtered)
--   - Driver Ably presence on market:{slug}:drivers_available

-- 1. Directed HMU signal. UNIQUE(driver_id, rider_id) so resend = UPDATE, not INSERT.
CREATE TABLE IF NOT EXISTS driver_to_rider_hmus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id UUID REFERENCES markets(id),
  status TEXT NOT NULL CHECK (status IN ('active','linked','dismissed','expired','unlinked')) DEFAULT 'active',
  message TEXT,
  linked_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  unlinked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(driver_id, rider_id)
);

CREATE INDEX IF NOT EXISTS idx_hmu_rider_status ON driver_to_rider_hmus(rider_id, status) WHERE status IN ('active','linked');
CREATE INDEX IF NOT EXISTS idx_hmu_driver_status ON driver_to_rider_hmus(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_hmu_market ON driver_to_rider_hmus(market_id, created_at DESC);

-- 2. Rider home areas — multi-select from the driver areas vocabulary. Null/empty = no declared area.
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS home_areas TEXT[] DEFAULT '{}';

-- 3. Persistent notifications for badge counts. Name chosen over `notifications`
--    (which CLAUDE.md documents but has never existed) to avoid confusion.
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_notif_unread ON user_notifications(user_id, read_at) WHERE read_at IS NULL;

-- 4. Admin-tunable HMU caps via existing platform_config. Null value = unlimited.
INSERT INTO platform_config (config_key, config_value, updated_by) VALUES
  ('hmu.cap_free_daily', '{"value": 20}'::jsonb, NULL),
  ('hmu.cap_hmu_first_daily', '{"value": 50}'::jsonb, NULL),
  ('hmu.cap_reset_mode', '{"mode": "calendar_day_et", "supported": ["calendar_day_et","rolling_24h"]}'::jsonb, NULL),
  ('hmu.expiry_hours', '{"value": 24}'::jsonb, NULL),
  ('hmu.rider_link_throttle_per_day', '{"value": null}'::jsonb, NULL)
ON CONFLICT (config_key) DO NOTHING;
