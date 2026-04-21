-- Dedupe column for the "$X is ready to cash out" SMS triggered by
-- Stripe's balance.available webhook on connected accounts.
--
-- The handler in app/api/webhooks/stripe/route.ts compares the Stripe-
-- reported current available (cents) for the driver's connected account
-- against this column. It only sends SMS when available has INCREASED
-- since the last notification. After sending, it updates the column to
-- the new value.
--
-- Dedupe semantics:
--   - Webhook retries (same event body): current == stored → no SMS
--   - New settlement batch: current > stored → one SMS, update column
--   - After a payout: current < stored → no SMS, column updates down
--     so the next positive delta re-qualifies naturally
--
-- Applied: 2026-04-21 to production branch (still-rain-53751745).
-- Do not re-apply on the production branch.

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS last_notified_available_cents INTEGER DEFAULT 0;
