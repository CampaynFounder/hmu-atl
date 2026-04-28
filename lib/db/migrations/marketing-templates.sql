-- Marketing SMS Templates
-- Replaces the hardcoded MESSAGE_TEMPLATES array in app/admin/marketing/marketing-dashboard.tsx
-- so admins can save/edit/archive their own templates from the UI.

CREATE TABLE IF NOT EXISTS marketing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketing_templates_active
  ON marketing_templates(archived_at, updated_at DESC);

-- Seed with the existing hardcoded templates so the UI doesn't appear empty
-- after the swap. Idempotent on label so re-runs don't duplicate.
INSERT INTO marketing_templates (label, body)
SELECT * FROM (VALUES
  ('General Signup', 'Ride scammers hate HMU. Payment held BEFORE driver pulls up. Drivers get paid. Riders get rides. Sign up free'),
  ('Driver Recruitment', 'Drive with HMU ATL. Set your price, get paid upfront, keep 90%. No apps or background checks. Go live now'),
  ('Rider Invite', 'Need a ride in ATL? HMU connects you with local drivers. Cheaper than Uber, no surge. Try it free'),
  ('No-Show Pain Point', 'Tired of riders going ghost? HMU ATL = riders pay BEFORE you drive. No payment, no ride. Stop wasting gas'),
  ('Safety Focused', 'HMU ATL: GPS tracked, verified payments, real ratings. Safer than FB cash ride groups. Sign up'),
  ('Platform Fees', 'Uber takes 40%. HMU? 10% on first $50/day, capped at $40. Hit the cap = rest is ALL yours'),
  ('Upfront Pay', 'How drivers know before they go. HMU holds fare in escrow before you leave the house. Get paid every time')
) AS seed(label, body)
WHERE NOT EXISTS (
  SELECT 1 FROM marketing_templates t WHERE t.label = seed.label
);
