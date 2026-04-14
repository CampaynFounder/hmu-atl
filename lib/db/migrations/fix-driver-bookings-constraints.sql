-- Fix driver_bookings constraints to match actual code usage
-- Applied: 2026-04-13

-- Status constraint was too restrictive (only confirmed/pending/cancelled)
-- Code uses: tentative, scheduled, confirmed, pending, in_progress, completed, cancelled, no_show
ALTER TABLE driver_bookings DROP CONSTRAINT IF EXISTS driver_bookings_status_check;
ALTER TABLE driver_bookings ADD CONSTRAINT driver_bookings_status_check
  CHECK (status IN ('tentative', 'scheduled', 'confirmed', 'pending', 'in_progress', 'completed', 'cancelled', 'no_show'));

-- Booking type was missing 'hold' which is used for tentative booking holds
ALTER TABLE driver_bookings DROP CONSTRAINT IF EXISTS driver_bookings_booking_type_check;
ALTER TABLE driver_bookings ADD CONSTRAINT driver_bookings_booking_type_check
  CHECK (booking_type IN ('ride', 'recurring_ride', 'blocked', 'break', 'hold'));

-- Backfill driver_bookings from existing rides that never got calendar entries
-- Use resolvedTime (scheduled pickup) when available, not created_at
INSERT INTO driver_bookings (driver_id, rider_id, ride_id, booking_type, start_at, end_at, status, market_id)
SELECT
  r.driver_id, r.rider_id, r.id, 'ride',
  COALESCE((r.agreement_summary->>'resolvedTime')::timestamptz, r.started_at, r.created_at),
  COALESCE(r.completed_at, r.ended_at, COALESCE((r.agreement_summary->>'resolvedTime')::timestamptz, r.created_at) + INTERVAL '45 minutes'),
  CASE
    WHEN r.status = 'completed' THEN 'completed'
    WHEN r.status IN ('cancelled', 'refunded') THEN 'cancelled'
    WHEN r.status IN ('otw', 'here', 'confirming', 'active', 'ended') THEN 'in_progress'
    ELSE 'confirmed'
  END,
  u.market_id
FROM rides r
JOIN users u ON u.id = r.driver_id
WHERE r.driver_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM driver_bookings db WHERE db.ride_id = r.id);
