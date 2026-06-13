-- Partner API foundation (PR1)
-- Additive only. Introduces machine-to-machine access for third-party vendors
-- who call HMU to list drivers, price trips, and (in later PRs) book rides.
-- Nothing here touches existing rider/driver/admin tables except one additive
-- column on driver_profiles (driver consent), which defaults FALSE so no
-- existing driver is opted into partner bookings.
--
-- Apply via Neon MCP on the staging branch first, then check in for prod.

-- ---------------------------------------------------------------------------
-- Partners: the vendors who hold API credentials.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_partners (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       TEXT        NOT NULL,
  -- 'pass_through'  → vendor collects the card on their frontend via a
  --                   SetupIntent we hand back; we store it on a guest customer.
  -- 'vendor_funded' → we charge the vendor's own platform Stripe customer.
  payer_mode                 TEXT        NOT NULL DEFAULT 'pass_through'
                                         CHECK (payer_mode IN ('pass_through', 'vendor_funded')),
  vendor_stripe_customer_id  TEXT,       -- only used when payer_mode = 'vendor_funded'
  markup_bps                 INTEGER     NOT NULL DEFAULT 0,  -- HMU fee on top, basis points
  market_ids                 UUID[]      NOT NULL DEFAULT '{}',  -- markets this partner may operate in
  webhook_url                TEXT,       -- where we POST outbound events (Phase 6)
  webhook_secret             TEXT,       -- HMAC secret for signing outbound events
  scopes                     TEXT[]      NOT NULL DEFAULT '{}',  -- e.g. drivers:read, quotes:read, bookings:write
  rate_limit_per_min         INTEGER     NOT NULL DEFAULT 60,
  status                     TEXT        NOT NULL DEFAULT 'active'
                                         CHECK (status IN ('active', 'suspended')),
  created_at                 TIMESTAMPTZ DEFAULT now(),
  updated_at                 TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- API keys: hashed credentials. The full key is shown to the partner exactly
-- once at creation; we persist only its SHA-256 hash. Supports rotation
-- (multiple live keys) and test/live separation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      UUID        NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  mode            TEXT        NOT NULL CHECK (mode IN ('test', 'live')),
  key_prefix      TEXT        NOT NULL,             -- e.g. 'hmu_live_a1b2c3' for display
  key_hash        TEXT        NOT NULL UNIQUE,      -- sha256(full key)
  signing_secret  TEXT        NOT NULL,             -- HMAC secret for inbound X-HMU-Signature
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_partner_id ON api_keys (partner_id);

-- ---------------------------------------------------------------------------
-- Partner riders: a vendor's customer mapped to a synthetic HMU users row, so
-- the existing ledger / dispute / eligibility machinery keeps working unchanged.
-- The synthetic users row uses clerk_id = 'partner:{partner_id}:{external_ref}'
-- so existing `WHERE clerk_id = ...` lookups never collide.
-- (Created/used in Phase 2 — table ships now so the FK shape is settled.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_riders (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          UUID        NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  external_ref        TEXT        NOT NULL,            -- vendor's own customer id
  user_id             UUID        NOT NULL REFERENCES users(id),
  stripe_customer_id  TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (partner_id, external_ref)
);

-- ---------------------------------------------------------------------------
-- Idempotency: generalizes the processed_webhook_events claim pattern so a
-- retried write (same partner + Idempotency-Key) replays the stored response
-- instead of double-creating a booking. (Used from Phase 5.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_idempotency (
  partner_id       UUID        NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  idem_key         TEXT        NOT NULL,
  response_status  INTEGER,
  response_body    JSONB,
  created_at       TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (partner_id, idem_key)
);

-- ---------------------------------------------------------------------------
-- Audit log: one row per partner API call for observability + abuse review.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   UUID,                       -- nullable: failed-auth calls have no partner
  api_key_id   UUID,
  endpoint     TEXT,
  method       TEXT,
  status       INTEGER,
  request_id   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_audit_log_partner_created
  ON api_audit_log (partner_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Outbound webhook delivery log (Phase 6). Ships now so the schema is stable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_webhook_deliveries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    UUID        NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL,
  target_url    TEXT        NOT NULL,
  status        INTEGER,
  attempts      INTEGER     NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_webhook_retry
  ON partner_webhook_deliveries (next_retry_at)
  WHERE delivered_at IS NULL;

-- ---------------------------------------------------------------------------
-- Driver consent: opt-in to receive third-party (partner) bookings.
-- Defaults FALSE so existing drivers are NOT silently exposed to vendors.
-- Enforced at booking time in Phase 2 (listing endpoints do not depend on it).
-- ---------------------------------------------------------------------------
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS accept_partner_bookings BOOLEAN NOT NULL DEFAULT FALSE;
