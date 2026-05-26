-- Out-of-market waitlist: captures phone numbers from users in cities
-- where HMU isn't live yet. Shown on hmucashride.com (apex) when geo-routing
-- detects the visitor is outside every active market's radius.
-- Applied via Neon MCP.

CREATE TABLE IF NOT EXISTS market_waitlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT NOT NULL,
  city         TEXT,                          -- CF-detected city name, best-effort
  market_slug  TEXT,                          -- nearest market slug if within ~200mi, else null
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at  TIMESTAMPTZ,
  source       TEXT DEFAULT 'apex_waitlist'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_waitlist_phone ON market_waitlist(phone);
CREATE INDEX IF NOT EXISTS idx_market_waitlist_unnotified ON market_waitlist(created_at) WHERE notified_at IS NULL;
