-- ============================================================
-- Down Bad Booking — schema + config seed
-- 2026-05-24
--
-- Introduces 'down_bad' as a first-class booking type.
-- A Down Bad ride is a peer-to-peer arrangement where the rider
-- offers a small cash deposit + an in-person 'sum extra' (food,
-- groceries, etc.). The platform charges a configurable facilitation
-- fee at Start Ride capture alongside the normal deposit.
--
-- All ALTERs are IF NOT EXISTS / additive. Safe to re-run.
-- Applied via Neon MCP on staging before prod cut-over.
-- ============================================================


-- ============================================================
-- 1. hmu_posts — sum extra fields
--    sum_extra_text:       rider's description ("10pc wing from my job")
--    sum_extra_media_url:  R2 URL of the required photo/video upload
--    sum_extra_media_type: 'photo' | 'video'
-- ============================================================

ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS sum_extra_text       TEXT,
  ADD COLUMN IF NOT EXISTS sum_extra_media_url  TEXT,
  ADD COLUMN IF NOT EXISTS sum_extra_media_type TEXT;

ALTER TABLE hmu_posts
  DROP CONSTRAINT IF EXISTS hmu_posts_sum_extra_media_type_check;

ALTER TABLE hmu_posts
  ADD CONSTRAINT hmu_posts_sum_extra_media_type_check
  CHECK (sum_extra_media_type IS NULL OR sum_extra_media_type IN ('photo', 'video'));


-- ============================================================
-- 2. hmu_posts — extend post_type CHECK to include 'down_bad'
--
--    Current set (from 2026-05-12-blast-booking.sql):
--      'driver_available', 'rider_request', 'direct_booking', 'blast'
--    After this migration:
--      + 'down_bad'
--
--    Pattern: dynamically find and drop the existing constraint,
--    then add the new one. Identical approach used in blast migration.
-- ============================================================

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
    'blast',
    'down_bad'
  ));


-- ============================================================
-- 3. rides — booking_type column
--    'standard' = every existing ride (default, backfills safely)
--    'down_bad'  = originated from a Down Bad post
-- ============================================================

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'standard';

ALTER TABLE rides
  DROP CONSTRAINT IF EXISTS rides_booking_type_check;

ALTER TABLE rides
  ADD CONSTRAINT rides_booking_type_check
  CHECK (booking_type IN ('standard', 'down_bad'));


-- ============================================================
-- 4. driver_profiles — Down Bad opt-in
--    accepts_down_bad:    driver has read the disclaimer + opted in
--    accepts_down_bad_at: timestamp of opt-in (audit trail)
-- ============================================================

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS accepts_down_bad    BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accepts_down_bad_at TIMESTAMPTZ;


-- ============================================================
-- 5. platform_config — Down Bad hyperparameters
--
--    down_bad.config:
--      enabled              — feature flag (start OFF)
--      fee_flat_cents       — flat facilitation fee taken at Start Ride capture
--      fee_pct              — % of declared cash amount (0 at launch, ramp up)
--      cash_floor_cents     — minimum cash rider must declare
--      cash_ceiling_cents   — maximum cash rider can declare
--      sum_extra_max_chars  — max length of sum_extra_text
--      require_min_rides    — min completed rides for rider to post Down Bad
--      require_min_chill_score — min chill score % for rider to post Down Bad
--
--    down_bad.disclaimer:
--      rider_text  — shown to rider before posting (must tap "I'm Down")
--      driver_text — shown to driver before opting in profile toggle
--
--    ON CONFLICT DO NOTHING so re-runs don't overwrite admin edits.
-- ============================================================

INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
VALUES (
  'down_bad.config',
  '{
    "enabled": false,
    "fee_flat_cents": 50,
    "fee_pct": 0,
    "cash_floor_cents": 500,
    "cash_ceiling_cents": 3000,
    "sum_extra_max_chars": 120,
    "require_min_rides": 0,
    "require_min_chill_score": 0
  }'::jsonb,
  'migration',
  NOW()
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
VALUES (
  'down_bad.disclaimer',
  '{
    "rider_text": "Down Bad rides are peer-to-peer agreements. HMU ATL connects you — we don''t verify or guarantee any sum extra. You and your driver are responsible for following through on what y''all agreed to.\n\nCheck your driver''s ratings and reviews before you commit. If the vibe is off, you can cancel before they tap OTW.\n\nHMU takes a small platform fee when you match — that''s our only cut.",
    "driver_text": "Down Bad rides are community-based. The rider is offering a lil cash + sum extra — an in-person exchange that''s between y''all. HMU connects you. We don''t guarantee sum extra.\n\nCheck their media and ratings before you run it. If the vibe''s off, swipe left."
  }'::jsonb,
  'migration',
  NOW()
)
ON CONFLICT (config_key) DO NOTHING;


-- ============================================================
-- 6. Index — fast lookup of Down Bad posts in driver swipe deck
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_hmu_posts_down_bad_active
  ON hmu_posts (created_at DESC)
  WHERE post_type = 'down_bad' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_rides_booking_type
  ON rides (booking_type, created_at DESC)
  WHERE booking_type = 'down_bad';


-- ============================================================
-- Verify (run manually after applying):
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_name = 'hmu_posts'
--      AND column_name IN ('sum_extra_text','sum_extra_media_url','sum_extra_media_type');
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'rides' AND column_name = 'booking_type';
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'driver_profiles'
--      AND column_name IN ('accepts_down_bad','accepts_down_bad_at');
--
--   SELECT config_key, config_value FROM platform_config
--    WHERE config_key LIKE 'down_bad.%';
-- ============================================================
