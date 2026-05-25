-- ride_interests: add updated_at column.
--
-- The bookings/decline route does an ON CONFLICT DO UPDATE that sets
-- updated_at = NOW() for rider_request and down_bad passes. ride_interests
-- was created directly in Neon without this column, so passes were hitting
-- "column updated_at does not exist" and returning 500.
--
-- IF NOT EXISTS makes this idempotent — safe to re-run if applied twice.

ALTER TABLE ride_interests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
