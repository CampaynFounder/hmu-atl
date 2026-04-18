-- Area/market routing + Pass-flow fix — step 1
-- Applied to Neon project still-rain-53751745 on 2026-04-18 via Neon MCP.
--
-- What this does:
--   1. Adds `cardinal` to market_areas (westside|eastside|northside|southside|central)
--      and inserts 3 new macro rows (northside, southside, central) for ATL.
--   2. Adds pickup_area_slug, dropoff_area_slug, dropoff_in_market, last_declined_by
--      to hmu_posts. Expands status enum with 'declined_awaiting_rider'.
--   3. Adds area_slugs (TEXT[]), services_entire_market, accepts_long_distance to
--      driver_profiles. Legacy `areas` JSONB stays read-only during transition.
--   4. Creates feed-query indexes on hmu_posts, driver_profiles.area_slugs (GIN),
--      and ride_interests(driver_id, status).
--   5. Backfills users.market_id and hmu_posts.market_id to ATL (only live market).
--      Flips hmu_posts.market_id to NOT NULL.
--   6. Maps legacy driver_profiles.areas labels → area_slugs + toggles.

-- 1. market_areas: add cardinal, backfill, insert 3 new macros
ALTER TABLE market_areas
  ADD COLUMN IF NOT EXISTS cardinal TEXT;

UPDATE market_areas SET cardinal = CASE slug
  WHEN 'downtown'          THEN 'central'
  WHEN 'midtown'           THEN 'central'
  WHEN 'buckhead'          THEN 'northside'
  WHEN 'west-end'          THEN 'westside'
  WHEN 'east-atlanta'      THEN 'eastside'
  WHEN 'decatur'           THEN 'eastside'
  WHEN 'college-park'      THEN 'southside'
  WHEN 'sandy-springs'     THEN 'northside'
  WHEN 'marietta'          THEN 'northside'
  WHEN 'stone-mountain'    THEN 'eastside'
  WHEN 'south-atlanta'     THEN 'southside'
  WHEN 'north-druid-hills' THEN 'northside'
  WHEN 'airport'           THEN 'southside'
  WHEN 'westside'          THEN 'westside'
  WHEN 'eastside'          THEN 'eastside'
END
WHERE market_id = '69957e98-95ae-4e04-af0f-c29bc103f773';

ALTER TABLE market_areas
  ALTER COLUMN cardinal SET NOT NULL,
  ADD CONSTRAINT market_areas_cardinal_check
    CHECK (cardinal IN ('westside','eastside','northside','southside','central'));

INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active) VALUES
  ('69957e98-95ae-4e04-af0f-c29bc103f773', 'northside', 'Northside', 'northside', 100, TRUE),
  ('69957e98-95ae-4e04-af0f-c29bc103f773', 'southside', 'Southside', 'southside', 101, TRUE),
  ('69957e98-95ae-4e04-af0f-c29bc103f773', 'central',   'Central',   'central',   102, TRUE)
ON CONFLICT (market_id, slug) DO NOTHING;

-- 2. hmu_posts: routing + pass-flow columns, status enum
ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS pickup_area_slug  TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_area_slug TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_in_market BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_declined_by  UUID REFERENCES users(id) ON DELETE SET NULL;

-- Widen status from VARCHAR(20) — 'declined_awaiting_rider' is 23 chars.
-- CHECK constraint enforces allowed values, so TEXT is safe.
ALTER TABLE hmu_posts ALTER COLUMN status TYPE TEXT;

ALTER TABLE hmu_posts DROP CONSTRAINT IF EXISTS hmu_posts_status_check;
ALTER TABLE hmu_posts ADD CONSTRAINT hmu_posts_status_check
  CHECK (status IN ('active','matched','expired','cancelled','completed','declined_awaiting_rider'));

-- 3. driver_profiles: slug-based routing fields (keep legacy areas JSONB intact)
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS area_slugs              TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services_entire_market  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accepts_long_distance   BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_hmu_posts_market_status_type_expires
  ON hmu_posts (market_id, status, post_type, expires_at);
CREATE INDEX IF NOT EXISTS idx_hmu_posts_market_status_booking_expires
  ON hmu_posts (market_id, status, booking_expires_at);
CREATE INDEX IF NOT EXISTS idx_hmu_posts_pickup_area_slug
  ON hmu_posts (pickup_area_slug);
CREATE INDEX IF NOT EXISTS idx_hmu_posts_last_declined_by
  ON hmu_posts (last_declined_by);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_area_slugs_gin
  ON driver_profiles USING GIN (area_slugs);
CREATE INDEX IF NOT EXISTS idx_ride_interests_driver_status
  ON ride_interests (driver_id, status);

-- 5. Backfill market_id on users + hmu_posts
UPDATE users
   SET market_id = '69957e98-95ae-4e04-af0f-c29bc103f773'
 WHERE market_id IS NULL;

UPDATE hmu_posts
   SET market_id = '69957e98-95ae-4e04-af0f-c29bc103f773'
 WHERE market_id IS NULL;

ALTER TABLE hmu_posts ALTER COLUMN market_id SET NOT NULL;

-- 6. Backfill driver_profiles.areas (JSONB) -> area_slugs + toggles
WITH label_map(label_lc, slug, is_entire_market, is_long_distance) AS (
  VALUES
    ('any area',          NULL::text,          TRUE,  FALSE),
    ('long distance ok',  NULL::text,          FALSE, TRUE ),
    ('west side',         'westside',          FALSE, FALSE),
    ('east side',         'eastside',          FALSE, FALSE),
    ('south side',        'southside',         FALSE, FALSE),
    ('north side',        'northside',         FALSE, FALSE),
    ('westside',          'westside',          FALSE, FALSE),
    ('eastside',          'eastside',          FALSE, FALSE),
    ('northside',         'northside',         FALSE, FALSE),
    ('southside',         'southside',         FALSE, FALSE),
    ('central',           'central',           FALSE, FALSE),
    ('buckhead',          'buckhead',          FALSE, FALSE),
    ('college park',      'college-park',      FALSE, FALSE),
    ('downtown',          'downtown',          FALSE, FALSE),
    ('midtown',           'midtown',           FALSE, FALSE),
    ('west end',          'west-end',          FALSE, FALSE),
    ('east atlanta',      'east-atlanta',      FALSE, FALSE),
    ('decatur',           'decatur',           FALSE, FALSE),
    ('sandy springs',     'sandy-springs',     FALSE, FALSE),
    ('marietta',          'marietta',          FALSE, FALSE),
    ('stone mountain',    'stone-mountain',    FALSE, FALSE),
    ('south atlanta',     'south-atlanta',     FALSE, FALSE),
    ('north druid hills', 'north-druid-hills', FALSE, FALSE),
    ('airport',           'airport',           FALSE, FALSE),
    ('airport area',      'airport',           FALSE, FALSE)
),
driver_labels AS (
  SELECT dp.user_id,
         LOWER(TRIM(lbl)) AS label_lc
    FROM driver_profiles dp,
         jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(dp.areas) = 'array' THEN dp.areas ELSE '[]'::jsonb END
         ) AS lbl
),
resolved AS (
  SELECT dl.user_id,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT lm.slug), NULL) AS slugs,
         BOOL_OR(COALESCE(lm.is_entire_market, FALSE))   AS entire_market,
         BOOL_OR(COALESCE(lm.is_long_distance, FALSE))   AS long_distance
    FROM driver_labels dl
    LEFT JOIN label_map lm ON lm.label_lc = dl.label_lc
   GROUP BY dl.user_id
)
UPDATE driver_profiles dp
   SET area_slugs             = COALESCE(r.slugs, '{}'),
       services_entire_market = COALESCE(r.entire_market, FALSE),
       accepts_long_distance  = COALESCE(r.long_distance,  FALSE)
  FROM resolved r
 WHERE dp.user_id = r.user_id;
