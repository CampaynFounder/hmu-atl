-- Unified cancellation flow (2026-05-09)
--
-- Adds the state needed to drive the rider-cancel-after-OTW request flow:
--
--   Rider taps Cancel after OTW
--     → POST /api/rides/[id]/cancel writes cancel_requested_at + cancel_requested_by='rider'
--     → ride stays 'otw'/'here'; driver sees a banner with countdown
--   Driver options:
--     a. Agree           → cancel_resolution='mutual_agreed'         (existing path)
--     b. Decline & keep  → cancel_resolution='driver_declined_kept_deposit'
--                          captures deposit; cancel_decline_platform_fee_pct
--                          (default 0) is the platform's slice
--     c. No response     → cancel_resolution='timeout_no_response'
--                          captures cancel_timeout_rider_fee_pct (default 20%)
--                          of deposit as platform fee, refunds rest, driver
--                          gets nothing. Logged in transaction_ledger.
--
-- Timing: cancel_request_timeout_seconds (default 180s = 3 min) is admin-
-- configurable from the platform_config table. Both clients run a countdown
-- and fire the timeout endpoint at expiry; cron backstop catches anything
-- the clients missed.
--
-- Idempotent. Safe to apply on staging then prod.

-- 1. New columns on rides
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_requested_by VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cancel_request_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancel_resolution VARCHAR(40);

-- Drop+recreate constraints so the migration is re-runnable.
ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_cancel_requested_by_check;
ALTER TABLE rides ADD CONSTRAINT rides_cancel_requested_by_check
  CHECK (cancel_requested_by IS NULL OR cancel_requested_by IN ('rider', 'driver'));

ALTER TABLE rides DROP CONSTRAINT IF EXISTS rides_cancel_resolution_check;
ALTER TABLE rides ADD CONSTRAINT rides_cancel_resolution_check
  CHECK (cancel_resolution IS NULL OR cancel_resolution IN (
    'rider_pre_otw',
    'driver_pre_otw',
    'mutual_agreed',
    'driver_declined_kept_deposit',
    'timeout_no_response',
    'admin_cancelled'
  ));

-- Cron + UI both query "is there a stale cancel_requested_at?" — index it.
CREATE INDEX IF NOT EXISTS idx_rides_cancel_requested_at
  ON rides (cancel_requested_at)
  WHERE cancel_requested_at IS NOT NULL AND cancel_resolution IS NULL;

-- 2. Admin-tunable cancellation knobs.
INSERT INTO platform_config (config_key, config_value, updated_by) VALUES
  (
    'cancellation.request_timeout_seconds',
    '{"value": 180, "min": 30, "max": 900, "label": "How long the driver has to respond to a rider''s post-OTW cancel request before the system auto-resolves it as a timeout."}'::jsonb,
    NULL
  ),
  (
    'cancellation.timeout_rider_fee_pct',
    '{"value": 0.20, "min": 0, "max": 1, "label": "Fraction of the deposit kept as platform fee when the driver fails to respond to a cancel request. The remainder is refunded to the rider; the driver receives nothing."}'::jsonb,
    NULL
  ),
  (
    'cancellation.decline_platform_fee_pct',
    '{"value": 0, "min": 0, "max": 1, "label": "Platform''s slice of the deposit when a driver actively declines a rider''s cancel request and keeps the fee. Default 0 — driver gets the whole deposit as gas comp."}'::jsonb,
    NULL
  )
ON CONFLICT (config_key) DO NOTHING;
