-- Delivery marketplace schema migration
-- Apply via Neon MCP on staging first, then prod.
-- All additive — no existing tables modified.

-- ── Delivery Requests ───────────────────────────────────────────────────────

CREATE TYPE delivery_status AS ENUM (
  'pending',
  'courier_accepted',
  'at_merchant',
  'receipt_uploaded',
  'en_route',
  'delivered',
  'completed',
  'cancelled',
  'disputed'
);

CREATE TABLE delivery_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id               TEXT NOT NULL,
  customer_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  courier_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  status                  delivery_status NOT NULL DEFAULT 'pending',

  -- Merchant location
  merchant_name           TEXT NOT NULL,
  merchant_address        TEXT NOT NULL,
  merchant_lat            DOUBLE PRECISION NOT NULL,
  merchant_lng            DOUBLE PRECISION NOT NULL,

  -- Customer delivery location
  customer_address        TEXT NOT NULL,
  customer_lat            DOUBLE PRECISION NOT NULL,
  customer_lng            DOUBLE PRECISION NOT NULL,

  -- Financials (all in cents)
  estimated_merchant_spend_cents  INT NOT NULL,
  delivery_fee_cents              INT NOT NULL,
  platform_fee_cents              INT NOT NULL,
  auth_buffer_cents               INT NOT NULL,
  total_hold_cents                INT NOT NULL,
  actual_merchant_spend_cents     INT,         -- set from receipt OCR on completion
  payment_intent_id               TEXT,
  payment_captured                BOOLEAN NOT NULL DEFAULT FALSE,

  -- Delivery PIN (4-digit, hashed)
  delivery_pin_hash       TEXT,

  -- Timestamps
  accepted_at             TIMESTAMPTZ,
  at_merchant_at          TIMESTAMPTZ,
  receipt_uploaded_at     TIMESTAMPTZ,
  en_route_at             TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_requests_customer ON delivery_requests(customer_id);
CREATE INDEX idx_delivery_requests_courier  ON delivery_requests(courier_id);
CREATE INDEX idx_delivery_requests_market   ON delivery_requests(market_id, status);
CREATE INDEX idx_delivery_requests_status   ON delivery_requests(status);

-- ── Delivery Items ───────────────────────────────────────────────────────────

CREATE TABLE delivery_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           UUID NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  quantity              INT NOT NULL DEFAULT 1,
  estimated_price_cents INT NOT NULL DEFAULT 0,
  actual_price_cents    INT,
  notes                 TEXT,
  photo_url             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_items_delivery ON delivery_items(delivery_id);

-- ── Delivery Receipts ────────────────────────────────────────────────────────

CREATE TABLE delivery_receipts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id         UUID NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  receipt_url         TEXT NOT NULL,
  ocr_total_cents     INT,
  ocr_merchant_name   TEXT,
  ocr_raw             JSONB,           -- full OpenAI vision response
  uploaded_by         UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Delivery Item Verification Photos ───────────────────────────────────────

CREATE TABLE delivery_item_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id   UUID NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  item_id       UUID REFERENCES delivery_items(id) ON DELETE SET NULL,
  photo_url     TEXT NOT NULL,
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Delivery GPS Audit Trail ─────────────────────────────────────────────────

CREATE TABLE delivery_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id   UUID NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  actor_id      UUID NOT NULL REFERENCES users(id),
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_delivery_locations_delivery ON delivery_locations(delivery_id, recorded_at DESC);

-- ── Updated-at trigger (reuse pattern from rides) ────────────────────────────

CREATE OR REPLACE FUNCTION update_delivery_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delivery_requests_updated_at
  BEFORE UPDATE ON delivery_requests
  FOR EACH ROW EXECUTE FUNCTION update_delivery_updated_at();
