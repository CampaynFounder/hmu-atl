-- Partner bookings (PR2b)
-- Tracks a vendor-initiated delivery booking through its lifecycle and holds
-- the computed delivery-fee split. The booking still flows through the normal
-- hmu_posts → driver-accept → rides machinery; this table is the partner-side
-- ledger that links them and records the money split + Stripe PaymentIntent.
--
-- Additive only. Apply to staging + prod neondb branches (no auto-runner).

CREATE TABLE IF NOT EXISTS partner_bookings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          UUID        NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  post_id             UUID        NOT NULL REFERENCES hmu_posts(id) ON DELETE CASCADE,
  ride_id             UUID        REFERENCES rides(id),         -- set when the driver accepts
  rider_id            UUID        NOT NULL REFERENCES users(id), -- synthetic partner rider
  driver_id           UUID        NOT NULL REFERENCES users(id),
  market_id           UUID,
  external_ref        TEXT,                                     -- vendor's customer id
  -- Money (cents). Split computed by lib/partner/fees at creation time.
  delivery_fee_cents  INTEGER     NOT NULL,
  platform_fee_cents  INTEGER     NOT NULL,                     -- HMU commission (Stripe application fee)
  driver_payout_cents INTEGER     NOT NULL,
  payment_intent_id   TEXT,                                     -- set when the hold is placed (at accept)
  status              TEXT        NOT NULL DEFAULT 'pending_accept'
                                  CHECK (status IN (
                                    'pending_accept', -- created, awaiting driver accept
                                    'accepted',       -- driver accepted, hold placed
                                    'hold_failed',    -- driver accepted but the card hold failed
                                    'captured',       -- delivery started, funds captured (PR2c)
                                    'completed',
                                    'cancelled',
                                    'expired'
                                  )),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_bookings_partner ON partner_bookings (partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_bookings_post    ON partner_bookings (post_id);
CREATE INDEX IF NOT EXISTS idx_partner_bookings_ride    ON partner_bookings (ride_id);
