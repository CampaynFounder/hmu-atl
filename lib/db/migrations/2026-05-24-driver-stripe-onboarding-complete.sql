-- Backfill migration: driver_profiles.stripe_onboarding_complete was added
-- directly to the DB without a migration file. This idempotent ADD COLUMN
-- ensures the column exists across all environments (staging, any future
-- DB branches) without failing if it already exists.
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;
