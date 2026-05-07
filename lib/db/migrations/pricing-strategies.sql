-- Pricing Strategy abstraction (Phase A — foundation, zero behavior change)
-- Adds three tables that let admin define multiple pricing modes, group users
-- into named cohorts, and assign individual users to specific cohorts.
--
-- Phase A behavior: seeds the existing capture-at-Start-Ride flow as
-- `legacy_full_fare` with is_default_global = TRUE. With no users assigned to
-- any cohort, every ride resolves to legacy_full_fare → identical behavior to
-- pre-migration.
--
-- Phase B will INSERT a `deposit_only` mode and flip is_default_global.
-- Phase C will INSERT cohorts + bulk-assign existing users.

CREATE TABLE IF NOT EXISTS pricing_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode_key TEXT UNIQUE NOT NULL,              -- 'legacy_full_fare' | 'deposit_only' | future modes
  display_name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  is_default_global BOOLEAN DEFAULT FALSE,    -- fallback for users with no explicit assignment
  hides_subscription BOOLEAN DEFAULT FALSE,   -- when active mode hides HMU First subscription UI
  config JSONB DEFAULT '{}'::jsonb,           -- mode-specific knobs (deposit min, fee rules, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

-- Exactly one mode can be the global default.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_modes_default_global
  ON pricing_modes(is_default_global) WHERE is_default_global = TRUE;

CREATE TABLE IF NOT EXISTS pricing_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,                  -- 'legacy' | 'promo_launch' | 'atl_pilot'
  display_name TEXT NOT NULL,
  description TEXT,
  pricing_mode_id UUID NOT NULL REFERENCES pricing_modes(id),
  is_default BOOLEAN DEFAULT FALSE,           -- new signups auto-join this cohort
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exactly one cohort can be the new-signup default.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_cohorts_default
  ON pricing_cohorts(is_default) WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS pricing_cohort_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,                      -- driver or rider
  cohort_id UUID NOT NULL REFERENCES pricing_cohorts(id),
  effective_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NULL,        -- NULL = currently active
  assigned_by UUID,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- One ACTIVE assignment per user. Historic rows keep expires_at IS NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_cohort_assignments_active
  ON pricing_cohort_assignments(user_id) WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pricing_cohort_assignments_cohort
  ON pricing_cohort_assignments(cohort_id);

CREATE INDEX IF NOT EXISTS idx_pricing_cohort_assignments_user
  ON pricing_cohort_assignments(user_id, effective_at DESC);

-- Seed: legacy_full_fare mode mirrors the current capture-at-Start-Ride
-- behavior. Reads existing pricing_config + hold_policy tables, so config is
-- intentionally empty here.
INSERT INTO pricing_modes (mode_key, display_name, description, enabled, is_default_global, hides_subscription, config)
VALUES (
  'legacy_full_fare',
  'Legacy full-fare',
  'Capture-at-Start-Ride for the full ride amount. Progressive tier fees + daily/weekly caps. Reads pricing_config and hold_policy tables.',
  TRUE,
  TRUE,
  FALSE,
  '{}'::jsonb
)
ON CONFLICT (mode_key) DO NOTHING;

-- Seed: legacy cohort (lets admin explicitly pin a user to legacy_full_fare
-- once non-default modes exist).
INSERT INTO pricing_cohorts (slug, display_name, description, pricing_mode_id, is_default)
SELECT 'legacy', 'Legacy', 'Users explicitly pinned to the legacy_full_fare pricing mode.', id, FALSE
FROM pricing_modes WHERE mode_key = 'legacy_full_fare'
ON CONFLICT (slug) DO NOTHING;
