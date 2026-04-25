-- Mirrors driver_profiles.profile_visible onto rider_profiles so admins can
-- hide misbehaving riders from driver-facing surfaces (find-riders feed,
-- HMU/Link rider directory) without resorting to account_status='suspended'
-- which blocks the rider's own app access entirely.
--
-- Default true backfills every existing rider as visible, matching the
-- driver default and pre-migration behavior.
--
-- Applied: 2026-04-25 to production branch (still-rain-53751745).
-- Do not re-apply on the production branch.

ALTER TABLE rider_profiles
  ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN NOT NULL DEFAULT TRUE;
