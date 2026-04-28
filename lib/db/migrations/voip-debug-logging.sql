-- VoIP debug logging
-- Persists every inbound webhook hit (incl. validation pings, parse failures)
-- and the full voip.ms API response on every outbound send.
-- Applied via Neon MCP on 2026-04-27.

CREATE TABLE IF NOT EXISTS voip_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method TEXT NOT NULL,                     -- 'GET' | 'POST'
  source TEXT NOT NULL,                     -- 'GET' | 'POST_QUERY' | 'POST_FORM' | 'POST_JSON' | 'POST_UNKNOWN'
  outcome TEXT NOT NULL,                    -- 'stored' | 'ping' | 'missing_fields' | 'parse_failed'
  raw_query TEXT,                           -- raw query string (no leading ?)
  raw_body TEXT,                            -- raw body (best-effort capture)
  content_type TEXT,
  parsed_params JSONB,                      -- normalized k/v we managed to parse
  from_phone TEXT,                          -- 10-digit, after normalization
  to_did TEXT,                              -- 10-digit, after normalization
  voipms_id TEXT,
  error TEXT,                               -- parse / db error if any
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voip_webhook_log_created ON voip_webhook_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voip_webhook_log_outcome ON voip_webhook_log (outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voip_webhook_log_from ON voip_webhook_log (from_phone, created_at DESC);

ALTER TABLE sms_log
  ADD COLUMN IF NOT EXISTS voipms_response JSONB,
  ADD COLUMN IF NOT EXISTS voipms_http_status INTEGER;
