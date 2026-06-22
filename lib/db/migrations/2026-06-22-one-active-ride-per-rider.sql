-- One active ride per rider — DB-level backstop against cross-ride state bleed.
--
-- Symptom this guards: a rider cancels ride A and immediately rebooks ride B.
-- Each booking is already a fresh row and cancellation is an in-place UPDATE on
-- A's row only, so B's stored status is never wrong. But if two non-terminal
-- ride rows ever coexist for one rider, /api/rides/active's
-- `ORDER BY created_at DESC LIMIT 1` is the ONLY thing disambiguating them, and
-- a stale/cancelled row could surface under races. This index makes the
-- ambiguous state impossible: a rider may have at most one ride in a live status.
--
-- The request route already cancels/expires the prior ride before inserting a
-- new one, so the index only fires as a safety net under races (raises 23505,
-- which the request route should catch and translate to a 409 + retry).
--
-- The live-status list mirrors the whitelist in app/api/rides/active/route.ts.
-- Keep the two in sync — if a new live status is added there, add it here too.
-- Status values not currently present (pending/accepted/in_progress) are
-- harmless in the predicate: they simply never match.

-- ── 1. Reconcile pre-existing duplicates ────────────────────────────────────
-- A unique index build (even CONCURRENTLY) fails if duplicates already exist.
-- Cancel the OLDER live ride(s) per rider, keeping the most-recent one — exactly
-- the row /api/rides/active already returns today, so this aligns the DB with
-- current observable behaviour WITHOUT changing any rider's "current" ride.
-- Stamped with a resolution marker so the cleanup is auditable.
--
-- ⚠️  Schema Agent: dry-run the SELECT below on the Neon staging branch first to
--     confirm how many rows this touches before applying to production.
--       SELECT rider_id, count(*) FROM rides
--       WHERE rider_id IS NOT NULL
--         AND status IN ('pending','accepted','matched','otw','here','active','in_progress','ended')
--       GROUP BY rider_id HAVING count(*) > 1;
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY rider_id ORDER BY created_at DESC) AS rn
  FROM rides
  WHERE rider_id IS NOT NULL
    AND status IN ('pending','accepted','matched','otw','here','active','in_progress','ended')
)
UPDATE rides r
SET status = 'cancelled',
    cancel_resolution = COALESCE(r.cancel_resolution, 'auto: superseded duplicate active ride'),
    updated_at = NOW()
FROM ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- ── 2. One-active-ride-per-rider constraint ─────────────────────────────────
-- CONCURRENTLY avoids an exclusive lock on the live rides table during build.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_one_active_ride_per_rider
  ON rides (rider_id)
  WHERE rider_id IS NOT NULL
    AND status IN ('pending','accepted','matched','otw','here','active','in_progress','ended');
