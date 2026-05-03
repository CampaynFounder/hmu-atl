-- Event partnership inquiries from /events landing page
-- Migration 007

CREATE TABLE IF NOT EXISTS event_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_slug TEXT NOT NULL DEFAULT 'atl',
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  event_name TEXT NOT NULL,
  event_date DATE,
  expected_attendance TEXT,
  social_handle TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'scoped', 'won', 'lost', 'closed')),
  ip_address TEXT,
  user_agent TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  contacted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_inquiries_status ON event_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_event_inquiries_created_at ON event_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_inquiries_market ON event_inquiries(market_slug);
CREATE INDEX IF NOT EXISTS idx_event_inquiries_email ON event_inquiries(email);
