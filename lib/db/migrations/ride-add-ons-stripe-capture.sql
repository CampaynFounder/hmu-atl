-- Per-extra Stripe capture tracking on ride_add_ons.
-- Applied: 2026-05-11
--
-- Extras are now charged through Stripe at driver-confirm time (off_session
-- destination charge against the rider's saved PaymentMethod). The platform
-- keeps `platform_fee_cents` via application_fee_amount; the driver Connect
-- account receives `driver_amount_cents` net. `stripe_fee_cents` is the
-- absorbed processor fee for the breakdown UI.
--
-- error_code/error_message hold Stripe's decline reason when a capture fails,
-- so the driver-confirm UI can render "Payment failed — card declined" and
-- the ride-end breakdown can skip failed extras from the totals.

ALTER TABLE ride_add_ons
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charge_status TEXT,
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS driver_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_fee_cents INTEGER,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Stripe charge status: 'succeeded' | 'failed' | 'requires_action' | 'pending'
ALTER TABLE ride_add_ons DROP CONSTRAINT IF EXISTS ride_add_ons_stripe_status_check;
ALTER TABLE ride_add_ons ADD CONSTRAINT ride_add_ons_stripe_status_check
  CHECK (stripe_charge_status IS NULL OR stripe_charge_status IN ('succeeded', 'failed', 'requires_action', 'pending'));

CREATE INDEX IF NOT EXISTS idx_ride_add_ons_stripe_pi ON ride_add_ons(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
