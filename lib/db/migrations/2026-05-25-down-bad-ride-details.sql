-- ============================================================
-- Down Bad — ride_details JSONB on hmu_posts
-- 2026-05-25
--
-- Stores optional rider-provided trip context collected on the
-- "Additional Details" step of the Down Bad form:
--   { additionalPassengers: 0-4, kids: 0-3, luggage: 'none'|'bag'|'trunk' }
--
-- NULL when the rider skips the step or all values are default.
-- Additive / safe to re-run.
-- Applied via Neon MCP on staging before prod cut-over.
-- ============================================================

ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS ride_details JSONB;
