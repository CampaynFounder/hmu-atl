-- Rider "I'm In" confirmation step (2026-05-08).
--
-- Adds a per-ride timestamp the rider stamps when they're physically in the
-- car. Drivers can't tap Start Ride until this is set; once set, the driver's
-- Start Ride either fires capture immediately or already-captured if the
-- platform_config 'payments.captureTrigger' is set to 'rider_confirm'.
--
-- The state machine still permits the legacy here → confirming → active path
-- so any in-flight ride at deploy time settles cleanly. New rides flow
-- here → active directly via the rider-confirm gate.

ALTER TABLE rides ADD COLUMN IF NOT EXISTS rider_in_car_confirmed_at TIMESTAMPTZ NULL;

-- Partial index — only confirmed rides need to be addressable by this column.
CREATE INDEX IF NOT EXISTS idx_rides_rider_in_car_confirmed_at
  ON rides(rider_in_car_confirmed_at)
  WHERE rider_in_car_confirmed_at IS NOT NULL;

-- Capture-trigger admin knob. Default 'driver_start_ride' preserves the
-- current capture-at-Start-Ride behavior; flipping to 'rider_confirm'
-- makes the rider's "I'm In" tap the capture point.
INSERT INTO platform_config (config_key, config_value, updated_by)
VALUES ('payments.captureTrigger', '{"trigger":"driver_start_ride"}'::jsonb, NULL)
ON CONFLICT (config_key) DO NOTHING;
