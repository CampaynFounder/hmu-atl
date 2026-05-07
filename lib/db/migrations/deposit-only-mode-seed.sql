-- Phase B — seed the deposit_only pricing mode (DORMANT).
-- Inserts the row but leaves is_default_global = FALSE. No users are assigned
-- to it yet, so production behavior is unchanged. Phase C will flip the
-- default and bulk-assign users to a `promo_launch` cohort.
--
-- Config JSON matches the launch decisions locked 2026-05-07:
--   feeFloorCents: $1.50 floor (in cents)
--   feePercent: 20% of deposit
--   depositMin: $5 minimum
--   depositIncrement: $1 increments
--   depositMaxPctOfFare: rider can pick up to 50% of total fare
--   noShowDriverPct: driver keeps 100% of deposit (minus fee) on no-show
--   depositRule: 'rider_select' (Phase B v1; future modes will add bands and percent-of-fare)

INSERT INTO pricing_modes (
  mode_key, display_name, description, enabled,
  is_default_global, hides_subscription, config
)
VALUES (
  'deposit_only',
  'Deposit-only (promo)',
  'Launch promo pricing: rider authorizes deposit only, driver collects remainder in cash on arrival. Platform fee = max($1.50, 20% of deposit) at Start Ride.',
  TRUE,
  FALSE,                  -- DORMANT until Phase C flips this
  TRUE,                   -- hides HMU First subscription UI when this mode is active
  '{
    "feeFloorCents": 150,
    "feePercent": 0.20,
    "depositMin": 5,
    "depositIncrement": 1,
    "depositMaxPctOfFare": 0.5,
    "noShowDriverPct": 1.0,
    "depositRule": "rider_select"
  }'::jsonb
)
ON CONFLICT (mode_key) DO NOTHING;
