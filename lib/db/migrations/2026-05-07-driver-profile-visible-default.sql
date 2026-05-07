-- Locks driver_profiles.profile_visible to NOT NULL DEFAULT TRUE and backfills
-- any existing NULL rows to TRUE.
--
-- Why: /rider/browse filters on `dp.profile_visible = true` (see
-- lib/hmu/browse-drivers-query.ts:118). createDriverProfile never wrote this
-- column, so onboarded drivers landed at NULL and stayed invisible to riders
-- until they manually toggled visibility on /driver/profile (which reads the
-- value with `?? true` and obscured the bug). The 2026-04-25 rider migration
-- claimed driver was already DEFAULT TRUE, but admin/activation typing
-- (`boolean | null`) plus observed prod behavior show the column is nullable.
--
-- Idempotent: safe to re-run. Apply order: staging first, then prod.

UPDATE driver_profiles
   SET profile_visible = TRUE
 WHERE profile_visible IS NULL;

ALTER TABLE driver_profiles
  ALTER COLUMN profile_visible SET DEFAULT TRUE,
  ALTER COLUMN profile_visible SET NOT NULL;
