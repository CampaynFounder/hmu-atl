-- Soft-confirmation flow for early ride ends. When a driver ends a ride
-- before reaching the dropoff, they pick a reason (`early_end_reason`).
-- The rider must then acknowledge or dispute that reason before they can
-- rate the ride — this gives Stripe chargeback defense an explicit
-- "rider saw and agreed" timestamp instead of relying on implicit ack
-- via the rating action itself.
--
-- NULL = not yet acknowledged
-- TRUE = rider explicitly agreed to the early end
-- FALSE = rider declined (route also flips status to 'disputed')
--
-- Idempotent.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS rider_acknowledged_early_end BOOLEAN,
  ADD COLUMN IF NOT EXISTS rider_acknowledged_at TIMESTAMPTZ;
