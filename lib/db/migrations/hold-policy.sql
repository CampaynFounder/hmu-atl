-- Hold Policy table: configurable deposit holds, voluntary cancel splits, and no-show progressive tiers
-- Applied: 2026-04-13

CREATE TABLE hold_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT CHECK (tier IN ('free', 'hmu_first')) NOT NULL,

  -- Hold strategy: how much to authorize on rider's card at COO
  hold_mode TEXT CHECK (hold_mode IN ('full', 'deposit_percent', 'deposit_fixed')) DEFAULT 'full',
  hold_percent NUMERIC(5,4) DEFAULT NULL,     -- e.g. 0.2500 = 25%
  hold_fixed NUMERIC(10,2) DEFAULT NULL,      -- e.g. 5.00
  hold_minimum NUMERIC(10,2) DEFAULT 5.00,    -- floor when using percent mode

  -- Voluntary cancel policy (capped at deposit amount)
  cancel_before_otw_refund_pct NUMERIC(5,4) DEFAULT 1.0000,   -- rider gets 100% back
  cancel_after_otw_driver_pct NUMERIC(5,4) DEFAULT 1.0000,    -- driver gets 100% of deposit
  cancel_after_otw_platform_pct NUMERIC(5,4) DEFAULT 0.0000,  -- platform takes 0%

  -- No-show policy (full authorized amount charged)
  -- Progressive platform tiers as JSONB array:
  -- [{"up_to":15,"rate":0.05},{"up_to":30,"rate":0.10},{"up_to":60,"rate":0.15},{"above":60,"rate":0.20}]
  no_show_platform_tiers JSONB DEFAULT '[]'::jsonb,

  -- Versioning (same pattern as pricing_config)
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE DEFAULT NULL,
  change_reason TEXT,
  changed_by UUID,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hold_policy_active ON hold_policy(tier, is_active, effective_from);

-- Rides table: track visible deposit and policy used
ALTER TABLE rides ADD COLUMN visible_deposit NUMERIC(10,2) DEFAULT NULL;
ALTER TABLE rides ADD COLUMN hold_policy_id UUID DEFAULT NULL;

-- Seed defaults
INSERT INTO hold_policy (tier, hold_mode, hold_percent, hold_minimum, no_show_platform_tiers, change_reason)
VALUES
  ('free', 'deposit_percent', 0.2500, 5.00,
   '[{"up_to":15,"rate":0.05},{"up_to":30,"rate":0.10},{"up_to":60,"rate":0.15},{"above":60,"rate":0.20}]'::jsonb,
   'Initial default — 25% deposit, progressive no-show tiers'),
  ('hmu_first', 'deposit_percent', 0.1500, 5.00,
   '[{"up_to":15,"rate":0.05},{"up_to":30,"rate":0.08},{"up_to":60,"rate":0.12},{"above":60,"rate":0.15}]'::jsonb,
   'Initial default — 15% deposit, lower no-show platform tiers for HMU First');
