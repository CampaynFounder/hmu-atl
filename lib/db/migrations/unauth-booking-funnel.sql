-- Unauth booking funnel — public draft bookings + recurring interest capture
-- 2026-05-05

-- public_draft_bookings: anon riders fill the booking drawer pre-auth, the
-- payload is parked here, then the post-auth callback consumes it and submits
-- via the existing /api/drivers/[handle]/book route. 15-min TTL — same window
-- as the direct_booking expiry so a draft never outlives the request it would
-- create. Single-use: deleted once consumed.
CREATE TABLE IF NOT EXISTS public_draft_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL,                            -- driver handle from /rider/browse
  payload JSONB NOT NULL,                          -- { price, isCash:false, timeWindow:{...} }
  ip_hash TEXT,                                    -- sha256(cf-connecting-ip + UA) for rate-limit telemetry
  consumed_at TIMESTAMPTZ,                         -- non-null once auth-callback turned it into a booking
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_draft_bookings_expires ON public_draft_bookings(expires_at);
CREATE INDEX IF NOT EXISTS idx_public_draft_bookings_handle ON public_draft_bookings(handle);

-- recurring_interest: email capture from the "Coming Soon" recurring toggle
-- in the drawer. Pre-launch demand list; we email when recurring ships.
CREATE TABLE IF NOT EXISTS recurring_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  market_id UUID REFERENCES markets(id),
  intended_frequency TEXT,                         -- 'daily' | 'weekly' | free text
  intended_days INTEGER[],                         -- [1..7], optional
  source TEXT,                                     -- 'browse_drawer' | future surfaces
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- non-null if signed in when captured
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_interest_market ON recurring_interest(market_id);
CREATE INDEX IF NOT EXISTS idx_recurring_interest_email ON recurring_interest(email);
