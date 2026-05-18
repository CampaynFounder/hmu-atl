-- Driver location-sharing preference.
-- When false: driver opts out of live GPS; blast matching falls back to
-- home_lat/home_lng (allow_home_location_fallback must be on, which it now
-- is in MATCHING_DEFAULTS). POST /api/driver/location is a no-op for
-- opted-out drivers so no other device accidentally re-enables GPS.
--
-- DEFAULT TRUE preserves existing behavior for all current drivers.

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS location_sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE;
