-- Driver Playbook — activation, education, attribution, feature-flag infra
-- Additive only. No column renames, no constraint tightening, no semantic changes.

-- ============================================================
-- 1. Feature flags (admin kill-switch for whole initiative)
-- ============================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INT NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  markets TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Seed: ships DISABLED. Admin must flip it on per-market or globally.
INSERT INTO feature_flags (slug, name, description, enabled)
VALUES (
  'driver_playbook',
  'Driver Playbook & Activation',
  'Get-Riders FAB, post-onboarding survey, playbook page, profile-completion card, tip banner, and related nudge cron. OFF = zero user-visible change.',
  FALSE
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 2. User survey + activation columns (self-reported, additive)
-- ============================================================
--   how_heard = self-reported answer to post-onboarding Q1.
--   Distinct from users.signup_source (UTM-derived, set by webhook).
ALTER TABLE users ADD COLUMN IF NOT EXISTS how_heard TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS driver_intent TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_progress JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS survey_shown_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS survey_completed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS survey_skipped_at TIMESTAMPTZ;

-- ============================================================
-- 3. First-touch attribution (cookie → user on signup)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cookie_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer TEXT,
  landing_path TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attached_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_attribution_user_id ON user_attribution(user_id);
CREATE INDEX IF NOT EXISTS idx_user_attribution_utm_source ON user_attribution(utm_source);
CREATE INDEX IF NOT EXISTS idx_user_attribution_utm_campaign ON user_attribution(utm_campaign);

-- ============================================================
-- 4. User preferences (dismiss / hide-tips / etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hide_tips BOOLEAN NOT NULL DEFAULT FALSE,
  checklist_dismissed_at TIMESTAMPTZ,
  playbook_last_viewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. Driver FB groups (admin-configurable, per-market)
-- ============================================================
CREATE TABLE IF NOT EXISTS driver_fb_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  audience TEXT,                    -- e.g. 'college', 'nightlife', 'neighborhood'
  suggested_caption TEXT,
  why_this_group TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_driver_fb_groups_market ON driver_fb_groups(market_slug, is_active, sort_order);
