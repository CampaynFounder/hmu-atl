-- ============================================================
-- Down Bad Schema Repair — 2026-05-25
--
-- Ensures every column and constraint required by the Down Bad
-- INSERT route exists, in case the 2026-05-24-down-bad-booking
-- migration only partially applied (e.g. the DO block dropped
-- the old post_type constraint but the ADD CONSTRAINT step
-- failed on a concurrent run).
--
-- ALL statements are idempotent / IF NOT EXISTS — safe to re-run.
-- Apply with:
--   psql "$DATABASE_URL_UNPOOLED" < lib/db/migrations/2026-05-25-down-bad-schema-repair.sql
-- ============================================================


-- 1. Ensure sum_extra columns exist on hmu_posts
ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS sum_extra_text       TEXT,
  ADD COLUMN IF NOT EXISTS sum_extra_media_url  TEXT,
  ADD COLUMN IF NOT EXISTS sum_extra_media_type TEXT;

-- Re-apply the sum_extra_media_type CHECK constraint
ALTER TABLE hmu_posts
  DROP CONSTRAINT IF EXISTS hmu_posts_sum_extra_media_type_check;

ALTER TABLE hmu_posts
  ADD CONSTRAINT hmu_posts_sum_extra_media_type_check
  CHECK (sum_extra_media_type IS NULL OR sum_extra_media_type IN ('photo', 'video'));


-- 2. Ensure target_driver_id exists on hmu_posts
ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS target_driver_id UUID REFERENCES users(id) ON DELETE SET NULL;


-- 3. Rebuild the post_type CHECK constraint to include 'down_bad'.
--    Drop any existing constraint whose definition mentions post_type,
--    then add the canonical one.
DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'hmu_posts'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%post_type%'
  LOOP
    EXECUTE format('ALTER TABLE hmu_posts DROP CONSTRAINT %I', cname);
  END LOOP;
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


-- 4. Ensure driver_profiles Down Bad opt-in columns exist
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS accepts_down_bad    BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accepts_down_bad_at TIMESTAMPTZ;


-- 5. Ensure rides.booking_type column exists
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'standard';

ALTER TABLE rides
  DROP CONSTRAINT IF EXISTS rides_booking_type_check;

ALTER TABLE rides
  ADD CONSTRAINT rides_booking_type_check
  CHECK (booking_type IN ('standard', 'down_bad'));


-- 6. Platform config — seed Down Bad config if missing
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


-- 7. Indexes (safe to re-run)
CREATE INDEX IF NOT EXISTS idx_hmu_posts_down_bad_active
  ON hmu_posts (created_at DESC)
  WHERE post_type = 'down_bad' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_rides_booking_type
  ON rides (booking_type, created_at DESC)
  WHERE booking_type = 'down_bad';


-- Verify
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'hmu_posts'
   AND column_name IN (
     'sum_extra_text', 'sum_extra_media_url', 'sum_extra_media_type',
     'target_driver_id'
   )
 ORDER BY column_name;
