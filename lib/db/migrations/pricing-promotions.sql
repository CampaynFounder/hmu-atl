-- Pricing & Promotions — Phase 1 (Schema)
--
-- Fully additive migration. No existing tables modified except for one nullable
-- column added to pricing_config. All new tables are introduced alongside
-- existing driver_enrollment_offers / driver_offer_enrollments (which are
-- feature-flagged off and will continue to work untouched until deprecated in
-- a later phase).
--
-- Safe to run multiple times (IF NOT EXISTS guards).

-- ============================================================================
-- 1. Market-readiness on pricing_config
-- ============================================================================
-- NULL = applies to all markets (current behavior). When market scoping is
-- enabled later, non-null rows win over NULL for that market.
ALTER TABLE pricing_config
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id);

CREATE INDEX IF NOT EXISTS idx_pricing_config_market_tier_active
  ON pricing_config (market_id, tier, is_active);

-- ============================================================================
-- 2. public_offers — drives strike-through pricing on marketing pages
-- ============================================================================
-- Display-only. Never affects fee calculation directly. Funnel-stage scoped.
-- One active row per (market_id, tier, funnel_stage_slug) via partial unique
-- index — NULL market_id / funnel_stage_slug mean "all".
CREATE TABLE IF NOT EXISTS public_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES markets(id),                    -- NULL = all markets
  tier TEXT NOT NULL CHECK (tier IN ('free','hmu_first')),
  funnel_stage_slug TEXT REFERENCES funnel_stages(slug),    -- NULL = all stages
  before_price_cents INTEGER NOT NULL,
  after_price_cents INTEGER NOT NULL,
  label_text TEXT,                                          -- e.g. "Limited Time", "First 50 Drivers"
  linked_promotion_id UUID,                                 -- FK added later (circular); enforced in app
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active offer per (market, tier, stage) cell. Uses coalesce via
-- expression so NULLs collapse to a sentinel UUID/text for uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_offers_unique_active
  ON public_offers (
    COALESCE(market_id::text, 'ALL'),
    tier,
    COALESCE(funnel_stage_slug, 'ALL')
  )
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_public_offers_lookup
  ON public_offers (tier, is_active, effective_from);

-- ============================================================================
-- 3. promotions — coupon definitions
-- ============================================================================
-- Source of truth for what a promo IS. driver_coupons are instances issued to
-- specific drivers.
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES markets(id),                    -- NULL = all markets

  name TEXT NOT NULL,
  description TEXT,

  code TEXT UNIQUE,                                         -- NULL = no shareable code (manual/auto only)

  promo_type TEXT NOT NULL CHECK (promo_type IN (
    'free_rides',         -- N rides at $0 platform fee
    'percent_off_fees',   -- X% off platform fee for Y rides or Y days
    'free_hmu_first'      -- Treat as hmu_first tier for N months
  )),

  -- Shape depends on promo_type:
  --  free_rides:         { "rides": 3 }
  --  percent_off_fees:   { "percent": 50, "days": 14 }    OR { "percent": 50, "rides": 10 }
  --  free_hmu_first:     { "months": 3 }
  benefit_config JSONB NOT NULL DEFAULT '{}'::jsonb,

  eligibility TEXT NOT NULL DEFAULT 'all_drivers' CHECK (eligibility IN (
    'new_drivers',        -- only drivers who sign up while promo active
    'all_drivers',        -- any driver can claim
    'specific_drivers',   -- only manually assigned drivers
    'funnel_stage'        -- drivers who signed up from a specific funnel stage
  )),
  -- Shape depends on eligibility:
  --  funnel_stage: { "funnel_stage_slug": "conversion" }
  --  specific_drivers: (no config — enforced via manual assignment only)
  eligibility_config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Global redemption cap. NULL = unlimited. FCFS across all drivers.
  global_redemption_cap INTEGER,
  global_redemptions_used INTEGER NOT NULL DEFAULT 0,

  auto_apply_on_signup BOOLEAN NOT NULL DEFAULT FALSE,

  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,

  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one auto_apply_on_signup promotion per (market, eligibility cell).
-- This is a soft guard; the app should also enforce on write.
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotions_one_auto_apply
  ON promotions (COALESCE(market_id::text, 'ALL'))
  WHERE auto_apply_on_signup = TRUE AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions (is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions (code) WHERE code IS NOT NULL;

-- Now that promotions exists, wire the public_offers -> promotions FK.
ALTER TABLE public_offers
  DROP CONSTRAINT IF EXISTS public_offers_linked_promotion_id_fkey;
ALTER TABLE public_offers
  ADD CONSTRAINT public_offers_linked_promotion_id_fkey
  FOREIGN KEY (linked_promotion_id) REFERENCES promotions(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. driver_coupons — issued instances (one per driver+promo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS driver_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,

  source TEXT NOT NULL CHECK (source IN (
    'auto_signup',
    'code_redemption',
    'manual_assignment'
  )),

  uses_remaining INTEGER,                                   -- NULL = time-based only (e.g. free_hmu_first)
  original_uses INTEGER,                                    -- snapshot of uses at issuance

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active','exhausted','expired','revoked'
  )),

  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  exhausted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revoke_reason TEXT,

  UNIQUE(driver_id, promotion_id)                           -- one claim per promo per driver
);

CREATE INDEX IF NOT EXISTS idx_driver_coupons_driver_active
  ON driver_coupons (driver_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_driver_coupons_promotion
  ON driver_coupons (promotion_id);

-- ============================================================================
-- 5. coupon_redemptions — ledger of every ride a coupon applied to
-- ============================================================================
-- One row per ride where a coupon actually reduced the platform fee.
-- Separate from transaction_ledger so we can analyze coupon economics cleanly.
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_coupon_id UUID NOT NULL REFERENCES driver_coupons(id) ON DELETE CASCADE,
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,

  fee_waived_cents INTEGER NOT NULL,                        -- what the coupon saved
  fee_would_have_been_cents INTEGER NOT NULL,               -- what the fee would have been at full rate
  fee_charged_cents INTEGER NOT NULL DEFAULT 0,             -- what we actually charged (0 for free_rides)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ride_id, driver_coupon_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon
  ON coupon_redemptions (driver_coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_ride
  ON coupon_redemptions (ride_id);

-- ============================================================================
-- 6. signup_pricing_snapshots — what pricing/offer was shown at signup
-- ============================================================================
-- One row per user at signup. Enables "honor what they saw" + funnel analysis.
CREATE TABLE IF NOT EXISTS signup_pricing_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  market_id UUID REFERENCES markets(id),
  funnel_stage TEXT,                                        -- slug, nullable — free-text tolerated for legacy

  pricing_config_free_id UUID REFERENCES pricing_config(id),
  pricing_config_hmu_first_id UUID REFERENCES pricing_config(id),
  public_offer_id UUID REFERENCES public_offers(id),
  auto_applied_promotion_id UUID REFERENCES promotions(id),
  auto_applied_coupon_id UUID REFERENCES driver_coupons(id),

  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_snapshots_funnel_stage
  ON signup_pricing_snapshots (funnel_stage);
CREATE INDEX IF NOT EXISTS idx_signup_snapshots_captured_at
  ON signup_pricing_snapshots (captured_at);

-- ============================================================================
-- 7. Permissions (RBAC)
-- ============================================================================
-- Add pricing + promotions permission strings. Hierarchical (view < edit <
-- publish) — enforced by hasPermission() in lib/admin/helpers.ts.
--
-- Safe no-op if the role isn't present or already has the permissions.

-- Content managers get view-only on pricing; edit on promotions.
UPDATE admin_roles
SET permissions = ARRAY(
  SELECT DISTINCT unnest(COALESCE(permissions, ARRAY[]::text[]) || ARRAY[
    'grow.pricing.view',
    'grow.promotions.view',
    'grow.promotions.edit'
  ])
)
WHERE slug = 'content_manager';

-- Finance gets view on both.
UPDATE admin_roles
SET permissions = ARRAY(
  SELECT DISTINCT unnest(COALESCE(permissions, ARRAY[]::text[]) || ARRAY[
    'grow.pricing.view',
    'grow.promotions.view'
  ])
)
WHERE slug = 'finance';

-- ============================================================================
-- Notes for later phases (do not execute here)
-- ============================================================================
-- Phase 4 will:
--   * add lib/payments/coupons.ts (lookup/apply/decrement)
--   * call coupon logic from lib/payments/escrow.ts::captureRiderPayment
--     BEFORE the existing isDriverInFreeWindow check. If a new coupon applies,
--     it takes precedence; otherwise fall through to the legacy
--     enrollment-offer path untouched.
--
-- Phase 6 will:
--   * tighten /app/admin/pricing and /app/admin/promotions to require
--     grow.pricing.view / grow.promotions.view respectively.
--
-- Future deprecation:
--   * driver_enrollment_offers / driver_offer_enrollments will be backfilled
--     into promotions / driver_coupons and removed. Not part of Phase 1-6.
