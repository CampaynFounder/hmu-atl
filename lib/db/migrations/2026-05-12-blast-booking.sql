-- ============================================================
-- Blast Booking — schema + config seed
-- Spec: docs/BLAST-BOOKING-SPEC.md (v2)
-- Ships DORMANT behind feature flag `blast_booking` (default OFF).
-- All ALTERs are IF NOT EXISTS / additive. Safe to re-run.
-- ============================================================

-- ============================================================
-- 1. Extend hmu_posts to support blast posts
--    Blast = rider-side concept. Driver inbox treats it identically to
--    rider_request. Distinct post_type lets analytics + admin filter.
-- ============================================================

ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS pickup_lat NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS pickup_lng NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_lat NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS dropoff_lng NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS dropoff_address TEXT,
  ADD COLUMN IF NOT EXISTS trip_type TEXT
    CHECK (trip_type IN ('one_way','round_trip')),
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storage_requested BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS driver_preference TEXT
    CHECK (driver_preference IN ('male','female','any'))
    DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS deposit_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id),
  ADD COLUMN IF NOT EXISTS expires_at_override TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bump_count INTEGER DEFAULT 0;

-- Extend post_type CHECK to include 'blast'.
-- Drop + re-add because Postgres CHECK constraints can't be modified in place.
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
   WHERE rel.relname = 'hmu_posts'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%post_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE hmu_posts DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE hmu_posts
  ADD CONSTRAINT hmu_posts_post_type_check
  CHECK (post_type IN (
    'driver_available',
    'rider_request',
    'direct_booking',
    'blast'
  ));

-- Hot path: "active blasts in this market sorted by scheduled time"
CREATE INDEX IF NOT EXISTS idx_hmu_posts_blast_active
  ON hmu_posts (market_id, status, scheduled_for)
  WHERE post_type = 'blast' AND status = 'active';

-- ============================================================
-- 2. blast_driver_targets
--    One row per driver per blast. Audit trail for matching algorithm
--    decisions, dedupe lookups, and outcome tracking.
-- ============================================================

CREATE TABLE IF NOT EXISTS blast_driver_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES hmu_posts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_score NUMERIC(6,3) NOT NULL,
  score_breakdown JSONB,
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  notification_channels TEXT[],
  hmu_at TIMESTAMPTZ,
  hmu_counter_price NUMERIC(10,2),
  passed_at TIMESTAMPTZ,
  selected_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  UNIQUE (blast_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_blast_driver_targets_blast
  ON blast_driver_targets (blast_id);

-- 30-min same-driver dedupe lookup ("did I notify this driver recently
-- for any blast from this rider?"). The query joins to hmu_posts on
-- blast_id to filter by user_id, so this composite index covers both.
CREATE INDEX IF NOT EXISTS idx_blast_driver_targets_driver_recent
  ON blast_driver_targets (driver_id, notified_at DESC);

-- ============================================================
-- 3. driver_blast_preferences
--    Per-driver opt-in, quiet hours, daily cap, fare floor.
--    Row created lazily on first blast notification (or driver edit).
-- ============================================================

CREATE TABLE IF NOT EXISTS driver_blast_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blasts_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  max_blasts_per_day INTEGER DEFAULT 20,
  min_fare_threshold NUMERIC(10,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. blast_rate_limits
--    Persistent record of rate-limit hits. Upstash is the primary
--    enforcement layer; this table is for admin abuse review and
--    weekly cron checks.
-- ============================================================

CREATE TABLE IF NOT EXISTS blast_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_kind TEXT NOT NULL
    CHECK (identifier_kind IN ('phone','ip','user_id')),
  identifier_value TEXT NOT NULL,
  blast_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  window_end TIMESTAMPTZ NOT NULL,
  UNIQUE (identifier_kind, identifier_value, window_end)
);

CREATE INDEX IF NOT EXISTS idx_blast_rate_limits_lookup
  ON blast_rate_limits (identifier_kind, identifier_value);

-- ============================================================
-- 5. Markets — per-market enable flag
--    Lets us dark-launch ATL only.
-- ============================================================

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS blast_enabled BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 6. Matching algorithm config (admin-tunable via /admin/blast-config)
--    Single platform_config row. Per-market overrides written as
--    `blast_matching_v1:market:{slug}` rows; reader merges over default.
-- ============================================================

INSERT INTO platform_config (config_key, config_value, updated_by) VALUES (
  'blast_matching_v1',
  '{
    "weights": {
      "proximity_to_pickup": 0.30,
      "recency_signin": 0.15,
      "sex_match": 0.15,
      "chill_score": 0.10,
      "advance_notice_fit": 0.10,
      "profile_view_count": 0.05,
      "completed_rides": 0.05,
      "low_recent_pass_rate": 0.10
    },
    "filters": {
      "max_distance_mi": 5.0,
      "min_chill_score": 50,
      "must_match_sex_preference": false,
      "must_be_signed_in_within_hours": 72,
      "exclude_if_in_active_ride": true,
      "exclude_if_today_passed_count_gte": 3
    },
    "limits": {
      "max_drivers_to_notify": 10,
      "min_drivers_to_notify": 3,
      "expand_radius_step_mi": 1.0,
      "expand_radius_max_mi": 15.0,
      "same_driver_dedupe_minutes": 30,
      "prioritize_hmu_first": false,
      "hmu_first_reserved_slots": 0
    },
    "expiry": {
      "default_blast_minutes": 15,
      "scheduled_blast_lead_minutes": 60
    },
    "deposit": {
      "default_amount_cents": 500,
      "percent_of_fare": 0.50,
      "max_deposit_cents": 5000
    },
    "default_price_dollars": 25,
    "price_per_mile_dollars": 2.00,
    "max_price_dollars": 200,
    "label": "Blast matching algorithm — weights (sum to ~1.0), absolute filters, fanout limits, expiry, and deposit policy. Edited via /admin/blast-config."
  }'::jsonb,
  NULL
) ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- 7. Cost-control + abuse knobs
--    These are independent of the matching JSON so admins can change
--    one without touching the other.
-- ============================================================

INSERT INTO platform_config (config_key, config_value, updated_by) VALUES
  (
    'blast.sms_kill_switch',
    '{"value": false, "label": "Global kill switch for blast SMS notifications. true = push only, no SMS sent for any blast. Cost-control lever."}'::jsonb,
    NULL
  ),
  (
    'blast.max_sms_per_blast',
    '{"value": 10, "min": 1, "max": 25, "label": "Hard ceiling on SMS sends per blast, regardless of matching algorithm output."}'::jsonb,
    NULL
  ),
  (
    'blast.rate_limit_per_phone_hour',
    '{"value": 5, "min": 1, "max": 50, "label": "Max blasts a single phone number can send per rolling hour."}'::jsonb,
    NULL
  ),
  (
    'blast.rate_limit_per_phone_day',
    '{"value": 20, "min": 1, "max": 100, "label": "Max blasts a single phone number can send per rolling day."}'::jsonb,
    NULL
  ),
  (
    'blast.draft_ttl_minutes',
    '{"value": 60, "min": 5, "max": 1440, "label": "How long the rider''s in-progress blast form persists in localStorage before clearing."}'::jsonb,
    NULL
  )
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- 8. Feature flags — ship dormant
--    Master switch + independent SMS toggle + admin-only switch.
-- ============================================================

INSERT INTO feature_flags (slug, name, description, enabled) VALUES
  (
    'blast_booking',
    'Blast Booking',
    'Unauth-friendly multi-driver fanout booking flow at /rider/browse/blast. OFF = route 404s and no driver receives blast notifications. See docs/BLAST-BOOKING-SPEC.md.',
    FALSE
  ),
  (
    'blast_sms',
    'Blast SMS Notifications',
    'Whether blast notifications include SMS via voip.ms in addition to push. Independent of master blast_booking flag. OFF = push-only fanout.',
    FALSE
  ),
  (
    'blast_admin_dashboards',
    'Blast Admin Dashboards',
    'Enables /admin/blast-config and /admin/blasts pages. Can be ON before blast_booking ships to riders, so admin can pre-tune matching algorithm.',
    FALSE
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Done.
-- Verify with:
--   SELECT config_key FROM platform_config WHERE config_key LIKE 'blast%' OR config_key = 'blast_matching_v1';
--   SELECT slug FROM feature_flags WHERE slug LIKE 'blast%';
--   \d hmu_posts
--   \d blast_driver_targets
-- ============================================================
