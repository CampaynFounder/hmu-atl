-- Webhook event idempotency. Stripe retries on 5xx/timeout; without dedup,
-- handlers fire duplicate side effects (double payouts, double SMS, tier
-- flip races). Handler claims the event_id with ON CONFLICT DO NOTHING; if
-- it didn't get the row, the event is already processed (or in flight) and
-- the handler returns 200 deduped. If processing throws, the handler deletes
-- the claim so the next Stripe retry can re-process from scratch.

CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id   TEXT PRIMARY KEY,
  source     TEXT NOT NULL DEFAULT 'stripe',
  event_type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
  ON processed_webhook_events(processed_at);
