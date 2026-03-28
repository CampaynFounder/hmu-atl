-- Admin Portal Database Additions
-- Run this migration to add admin-specific tables

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at);

-- Markets table (for future multi-market support)
CREATE TABLE IF NOT EXISTS markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  state TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  is_active BOOLEAN DEFAULT FALSE,
  launched_at TIMESTAMPTZ,
  did_phone TEXT,
  geo_center_lat NUMERIC(10,8),
  geo_center_lng NUMERIC(11,8),
  geo_radius_miles INTEGER DEFAULT 50,
  areas TEXT[],
  min_ride_price NUMERIC(10,2) DEFAULT 10,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Support tickets (Phase 2, but create table now)
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  category TEXT CHECK (category IN ('payment','driver_complaint','rider_complaint','bug','other')),
  message TEXT NOT NULL,
  screenshot_url TEXT,
  device_info TEXT,
  ride_id UUID REFERENCES rides(id),
  status TEXT CHECK (status IN ('open','in_progress','resolved','closed')) DEFAULT 'open',
  admin_id UUID REFERENCES users(id),
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);

-- Add market column to existing tables (non-breaking)
ALTER TABLE users ADD COLUMN IF NOT EXISTS market TEXT DEFAULT 'atl';
ALTER TABLE rides ADD COLUMN IF NOT EXISTS market TEXT DEFAULT 'atl';
ALTER TABLE hmu_posts ADD COLUMN IF NOT EXISTS market TEXT DEFAULT 'atl';
