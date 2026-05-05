-- Live driver location for /rider/browse distance badge.
-- 2026-05-05
--
-- Stored on driver_profiles (not a separate location table) because we only
-- ever need the LATEST point — there's no history-keeping requirement here
-- (ride_locations already does that for active rides). Coords are server-side
-- only: queryBrowseDrivers computes distance and returns scalar miles, never
-- the raw lat/lng. Stale rule: location_updated_at > 5min → distance hidden.

ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS current_lat NUMERIC(10,8);
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS current_lng NUMERIC(11,8);
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS location_accuracy_m INTEGER;
ALTER TABLE driver_profiles ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- Partial index — most rows will be NULL (drivers who never granted permission
-- or are offline). Indexing only the populated rows keeps it tiny.
CREATE INDEX IF NOT EXISTS idx_driver_profiles_location_fresh
  ON driver_profiles(location_updated_at)
  WHERE location_updated_at IS NOT NULL;
