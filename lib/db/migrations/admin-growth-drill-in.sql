-- Admin Growth Drill-In
-- Supports Live Ops "new users since last visit" + Growth tab drill-ins.
-- - Signup attribution (source + referring driver) for Growth drill-in details
-- - Per-admin cursor for "new since I last checked" counter on Live Ops
-- - Rider phone cache (driver_profiles.phone already exists)
-- - Admin SMS audit for "have we texted them Y/N" column + outreach tracking

-- Signup attribution on users
-- signup_source: 'hmu_chat' (came via /d/[handle]) | 'direct' | 'homepage_lead' | null
-- referred_by_driver_id: driver user_id resolved from handle at signup
-- referred_via_hmu_post_id: optional audit field when a live post was present
-- admin_last_seen_at: per-admin cursor (only meaningful where is_admin=true)
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_source TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_driver_id UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_via_hmu_post_id UUID REFERENCES hmu_posts(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_referred_by_driver_id ON users(referred_by_driver_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Rider phone cache (driver_profiles.phone already exists in live schema)
ALTER TABLE rider_profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Admin SMS audit log — every outbound SMS from admin UI lands here
CREATE TABLE IF NOT EXISTS admin_sms_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(id),
  recipient_id UUID REFERENCES users(id),
  recipient_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  twilio_sid TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sms_recipient ON admin_sms_sent(recipient_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sms_sent_at ON admin_sms_sent(sent_at DESC);
