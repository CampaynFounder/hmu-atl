-- Rider ad-funnel onboarding + profile-views growth tracking.
-- Part of feat/rider-express-onboarding. Adds:
--   1. rider_profiles.handle (referenced in lib/db/profiles.ts but column was missing)
--   2. profile_views table — atomic counter, race-safe via INSERT … ON CONFLICT
--   3. platform_config row for onboarding.rider_ad_funnel (admin-tunable)
--
-- Applied via Neon MCP on 2026-04-30 to project still-rain-53751745, main branch.
-- This file exists for repo history; all statements are idempotent so re-running
-- is safe but unnecessary.

-- ============================================================
-- 1. Rider handle
-- ============================================================
ALTER TABLE rider_profiles
  ADD COLUMN IF NOT EXISTS handle TEXT;

-- Case-insensitive uniqueness, matching driver_profiles.handle.
-- WHERE clause keeps the partial index small while existing riders are NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_profiles_handle_ci
  ON rider_profiles (LOWER(REPLACE(handle, ' ', '')))
  WHERE handle IS NOT NULL;

-- ============================================================
-- 2. profile_views — atomic per-(rider, driver) counter
-- One row per unique (rider, driver) pair. Click handler does
--   INSERT … ON CONFLICT (rider_id, driver_id)
--     DO UPDATE SET view_count = profile_views.view_count + 1,
--                   last_viewed_at = NOW()
-- which Postgres serialises via row lock — race-safe with no app coordination.
-- ============================================================
CREATE TABLE IF NOT EXISTS profile_views (
  rider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL DEFAULT 1,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rider_id, driver_id)
);

-- Driver dashboard reads "who viewed me, most recent first".
CREATE INDEX IF NOT EXISTS idx_profile_views_driver_recent
  ON profile_views(driver_id, last_viewed_at DESC);

-- Rider history (less hot, but useful for "recently viewed drivers").
CREATE INDEX IF NOT EXISTS idx_profile_views_rider_recent
  ON profile_views(rider_id, last_viewed_at DESC);

-- ============================================================
-- 3. Ad-funnel onboarding config
-- Mirrors onboarding.driver_express. Edited at /admin/onboarding-config.
-- Field visibility: required | optional | hidden | deferred
-- ============================================================
INSERT INTO platform_config (config_key, config_value, updated_by)
VALUES (
  'onboarding.rider_ad_funnel',
  '{
    "enabled": true,
    "fields": {
      "handle": "required",
      "media": "required",
      "location": "required",
      "safetyChecks": "optional"
    },
    "confirmationCta": "Browse Drivers",
    "browseRoute": "/rider/browse"
  }'::jsonb,
  'rider-ad-funnel-seed'
)
ON CONFLICT (config_key) DO NOTHING;
