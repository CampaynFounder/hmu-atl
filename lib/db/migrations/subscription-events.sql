-- Subscription event tracking for HMU First metrics
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,  -- 'created', 'renewed', 'cancelled', 'payment_failed'
  stripe_subscription_id TEXT,
  amount NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON subscription_events(user_id, created_at DESC);
