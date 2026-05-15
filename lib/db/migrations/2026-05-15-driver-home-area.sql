-- Driver "home area" — where the driver usually drives from.
-- 2026-05-15
--
-- Distinct from current_lat/lng (the passive GPS point that goes stale after
-- 5 minutes). home_* is a stable, user-curated location surfaced on rider
-- discovery cards so a rider knows roughly where a driver is based even when
-- the driver is offline. Set/cleared via /api/drivers/home-area; no onboarding
-- gate — drivers can drive without it. Matching/browse queries fall back to
-- home_* when current_* is missing or stale in a later PR (deferred — this
-- migration only lands the columns).
--
-- All columns nullable. Index is partial (only populated rows) since most
-- drivers will not have a home set initially.

ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS home_lat NUMERIC(10,8);
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS home_lng NUMERIC(11,8);
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS home_label TEXT;
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS home_mapbox_id TEXT;
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS home_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_driver_profiles_home_set
  ON driver_profiles(home_updated_at)
  WHERE home_lat IS NOT NULL AND home_lng IS NOT NULL;

-- Verify with:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'driver_profiles' AND column_name LIKE 'home%';
