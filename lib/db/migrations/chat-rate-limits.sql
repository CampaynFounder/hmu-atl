-- Chat/Booking Rate Limits + Suspect Usage Audit
-- Backs PR1: chat booking auth gate, rate limits, and admin suspect-usage page.

-- Generic rolling-window counter. Atomic UPSERT resets the window automatically
-- once the current window has expired. One row per (key), keyed like:
--   chat:msg:<userId>        chat:open:<userId>
--   book:<riderId>           book:<riderId>:<driverId>
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow periodic cleanup of expired keys (not strictly required since
-- the next request resets the row, but useful for eyeballing and vacuum).
CREATE INDEX IF NOT EXISTS idx_rate_limit_updated_at ON rate_limit_counters(updated_at);

-- Audit log of every rate-limit trip. Feeds /admin/suspect-usage.
-- event_type examples: 'chat_message_rate', 'chat_open_rate', 'booking_rate',
-- 'same_driver_booking_rate', 'self_booking_attempt', 'driver_booking_self_via_ui'.
CREATE TABLE IF NOT EXISTS suspect_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suspect_usage_user ON suspect_usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspect_usage_created ON suspect_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suspect_usage_event_type ON suspect_usage_events(event_type);
