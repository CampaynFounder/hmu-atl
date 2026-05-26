-- Expansion market pre-seed — 21 cities, status='setup'
-- Replicates what /admin/markets/new does so admin can activate without
-- running through the creation wizard. Each market gets:
--   1. markets row (status='setup', no sms_did — add when you buy the DID)
--   2. 5 cardinal macro areas + named neighborhood areas
--   3. ATL CMS content cloned as drafts (admin reviews before publishing)
--   4. ATL personas + page section layouts cloned
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE throughout.
-- Run against staging first; then prod once verified.
--
-- ATL market id (Neon project still-rain-53751745):
--   69957e98-95ae-4e04-af0f-c29bc103f773

DO $$
DECLARE
  atl_id UUID := '69957e98-95ae-4e04-af0f-c29bc103f773';
  mid    UUID;
  c      RECORD;
BEGIN
  -- ── PHASE 1: Insert market rows + cardinal macros + CMS clone ──────────────
  FOR c IN SELECT * FROM (VALUES
    --  slug     name              state  timezone                lat       lng        r   area_code
    ('aug',    'Augusta',         'GA', 'America/New_York',  33.4735, -82.0105,   30, '706'),
    ('macon',  'Macon',           'GA', 'America/New_York',  32.8407, -83.6324,   30, '478'),
    ('sav',    'Savannah',        'GA', 'America/New_York',  32.0809, -81.0912,   30, '912'),
    ('vld',    'Valdosta',        'GA', 'America/New_York',  30.8327, -83.2785,   25, '229'),
    ('csg',    'Columbus',        'GA', 'America/New_York',  32.4610, -84.9877,   25, '706'),
    ('tpa',    'Tampa',           'FL', 'America/New_York',  27.9506, -82.4572,   40, '813'),
    ('mia',    'Miami',           'FL', 'America/New_York',  26.0000, -80.2000,   40, '305'),
    ('orl',    'Orlando',         'FL', 'America/New_York',  28.5383, -81.3792,   35, '407'),
    ('mem',    'Memphis',         'TN', 'America/Chicago',   35.1495, -90.0490,   40, '901'),
    ('bna',    'Nashville',       'TN', 'America/Chicago',   36.1627, -86.7816,   40, '615'),
    ('knx',    'Knoxville',       'TN', 'America/New_York',  35.9606, -83.9207,   30, '865'),
    ('cha',    'Chattanooga',     'TN', 'America/New_York',  35.0456, -85.3097,   30, '423'),
    ('bhm',    'Birmingham',      'AL', 'America/Chicago',   33.5186, -86.8104,   35, '205'),
    ('mgm',    'Montgomery',      'AL', 'America/Chicago',   32.3668, -86.3000,   30, '334'),
    ('hou',    'Houston',         'TX', 'America/Chicago',   29.7604, -95.3698,   50, '713'),
    ('dfw',    'Dallas',          'TX', 'America/Chicago',   32.7767, -96.7970,   50, '214'),
    ('clt',    'Charlotte',       'NC', 'America/New_York',  35.2271, -80.8431,   35, '704'),
    ('chi',    'Chicago',         'IL', 'America/Chicago',   41.8781, -87.6298,   45, '312'),
    ('dtw',    'Detroit',         'MI', 'America/Detroit',   42.3314, -83.0458,   40, '313'),
    ('stl',    'St. Louis',       'MO', 'America/Chicago',   38.6270, -90.1994,   40, '314'),
    ('cin',    'Cincinnati',      'OH', 'America/New_York',  39.1031, -84.5120,   35, '513')
  ) AS t(slug, name, state, timezone, lat, lng, r, area_code)
  LOOP
    INSERT INTO markets (
      slug, name, subdomain, state, timezone, status,
      center_lat, center_lng, radius_miles,
      sms_did, sms_area_code, min_drivers_to_launch,
      fee_config, launch_offer_config, branding
    ) VALUES (
      c.slug, c.name, c.slug, c.state, c.timezone, 'setup',
      c.lat, c.lng, c.r,
      NULL, c.area_code, 0,
      '{}'::jsonb, '{}'::jsonb,
      '{"slang":{"match":"HMU","confirm":"Pull Up"},"tagline":"Make Bank Trips not Blank Trips"}'::jsonb
    )
    ON CONFLICT (slug) DO UPDATE SET
      name         = EXCLUDED.name,
      timezone     = EXCLUDED.timezone,
      center_lat   = EXCLUDED.center_lat,
      center_lng   = EXCLUDED.center_lng,
      radius_miles = EXCLUDED.radius_miles,
      updated_at   = NOW()
    RETURNING id INTO mid;

    IF mid IS NULL THEN
      SELECT id INTO mid FROM markets WHERE slug = c.slug;
    END IF;

    -- Cardinal macros (routing foundation for every market)
    INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active) VALUES
      (mid, 'central',   'Central',   'central',   100, TRUE),
      (mid, 'eastside',  'Eastside',  'eastside',  101, TRUE),
      (mid, 'westside',  'Westside',  'westside',  102, TRUE),
      (mid, 'northside', 'Northside', 'northside', 103, TRUE),
      (mid, 'southside', 'Southside', 'southside', 104, TRUE)
    ON CONFLICT (market_id, slug) DO NOTHING;

    -- CMS clone from ATL — swap city name, force draft for admin review
    INSERT INTO content_variants (
      zone_id, market_id, variant_name, content, status,
      seo_keywords, utm_targets, weight, created_by, updated_by
    )
    SELECT
      zone_id, mid, variant_name,
      REPLACE(
        REPLACE(content::text, 'Atlanta', c.name),
        'atl.hmucashride.com',
        'hmucashride.com'
      )::jsonb,
      'draft',
      seo_keywords, utm_targets, weight, created_by, updated_by
    FROM content_variants
    WHERE market_id = atl_id
    ON CONFLICT DO NOTHING;

    INSERT INTO personas (slug, label, description, audience, market_id, color, is_active, sort_order)
    SELECT slug, label, description, audience, mid, color, is_active, sort_order
    FROM personas WHERE market_id = atl_id
    ON CONFLICT DO NOTHING;

    INSERT INTO page_section_layouts (page_slug, funnel_stage_slug, market_id, sections, created_by, updated_by)
    SELECT page_slug, funnel_stage_slug, mid, sections, created_by, updated_by
    FROM page_section_layouts WHERE market_id = atl_id
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Seeded: % — %', c.slug, mid;
  END LOOP;
END $$;


-- ── PHASE 2: Named neighborhoods per city ─────────────────────────────────────
-- Admin can rename / add / reorder these in /admin/markets/<slug>/areas.
-- Cardinal assignment determines which macro the driver's post rolls up to.

-- Augusta, GA
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-augusta',  'Downtown Augusta',  'central',   1),
  ('summerville',       'Summerville',        'northside',  2),
  ('north-augusta',     'North Augusta',      'northside',  3),
  ('martinez',          'Martinez',           'northside',  4),
  ('grovetown',         'Grovetown',          'westside',   5),
  ('fort-eisenhower',   'Fort Eisenhower',    'southside',  6),
  ('aiken',             'Aiken, SC',          'westside',   7),
  ('augusta-airport',   'Augusta Airport',    'southside',  8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'aug'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Macon, GA
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-macon',    'Downtown Macon',     'central',   1),
  ('midtown-macon',     'Midtown Macon',      'central',   2),
  ('north-macon',       'North Macon',        'northside',  3),
  ('mercer-university', 'Mercer University',  'northside',  4),
  ('east-macon',        'East Macon',         'eastside',   5),
  ('warner-robins',     'Warner Robins',      'southside',  6),
  ('forsyth',           'Forsyth',            'westside',   7),
  ('middle-ga-airport', 'Middle GA Airport',  'central',    8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'macon'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Savannah, GA
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('historic-district', 'Historic District',  'central',   1),
  ('midtown-savannah',  'Midtown Savannah',   'central',   2),
  ('southside-savannah','Southside',          'southside',  3),
  ('pooler',            'Pooler',             'westside',   4),
  ('garden-city',       'Garden City',        'northside',  5),
  ('richmond-hill',     'Richmond Hill',      'southside',  6),
  ('tybee-island',      'Tybee Island',       'eastside',   7),
  ('sav-airport',       'SAV Airport',        'westside',   8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'sav'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Valdosta, GA
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-valdosta', 'Downtown Valdosta',  'central',   1),
  ('vsu-campus',        'VSU Campus',         'central',   2),
  ('north-valdosta',    'North Valdosta',     'northside',  3),
  ('south-valdosta',    'South Valdosta',     'southside',  4),
  ('hahira',            'Hahira',             'northside',  5),
  ('lake-park',         'Lake Park',          'southside',  6),
  ('moody-afb',         'Moody AFB',          'eastside',   7)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'vld'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Columbus, GA
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-columbus', 'Downtown Columbus',  'central',   1),
  ('midtown-columbus',  'Midtown Columbus',   'central',   2),
  ('north-columbus',    'North Columbus',     'northside',  3),
  ('south-columbus',    'South Columbus',     'southside',  4),
  ('phenix-city',       'Phenix City, AL',    'eastside',   5),
  ('fort-moore',        'Fort Moore',         'southside',  6),
  ('columbus-airport',  'Columbus Airport',   'southside',  7)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'csg'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Tampa, FL
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-tampa',    'Downtown Tampa',     'central',   1),
  ('ybor-city',         'Ybor City',          'eastside',   2),
  ('hyde-park',         'Hyde Park',          'central',   3),
  ('channelside',       'Channelside',        'central',   4),
  ('westshore',         'Westshore',          'westside',   5),
  ('brandon',           'Brandon',            'eastside',   6),
  ('st-petersburg',     'St. Petersburg',     'southside',  7),
  ('clearwater',        'Clearwater',         'northside',  8),
  ('tpa-airport',       'TPA Airport',        'westside',   9)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'tpa'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Miami / Fort Lauderdale, FL
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-miami',    'Downtown Miami',     'central',   1),
  ('brickell',          'Brickell',           'central',   2),
  ('wynwood',           'Wynwood / Midtown',  'central',   3),
  ('miami-beach',       'Miami Beach',        'eastside',   4),
  ('little-havana',     'Little Havana',      'westside',   5),
  ('fort-lauderdale',   'Fort Lauderdale',    'northside',  6),
  ('coral-gables',      'Coral Gables',       'southside',  7),
  ('homestead',         'Homestead',          'southside',  8),
  ('mia-airport',       'MIA Airport',        'westside',   9)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'mia'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Orlando, FL
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-orlando',  'Downtown Orlando',   'central',   1),
  ('international-drive','International Drive','westside',  2),
  ('disney-area',       'Disney / Lake Buena Vista','westside',3),
  ('ucf-east-orlando',  'UCF / East Orlando', 'eastside',   4),
  ('lake-nona',         'Lake Nona',          'southside',  5),
  ('kissimmee',         'Kissimmee',          'southside',  6),
  ('sanford',           'Sanford',            'northside',  7),
  ('mco-airport',       'MCO Airport',        'eastside',   8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'orl'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Memphis, TN
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-memphis',  'Downtown Memphis',   'central',   1),
  ('midtown-memphis',   'Midtown Memphis',    'central',   2),
  ('beale-street',      'Beale Street',       'central',   3),
  ('east-memphis',      'East Memphis',       'eastside',   4),
  ('germantown',        'Germantown',         'eastside',   5),
  ('collierville',      'Collierville',       'eastside',   6),
  ('bartlett',          'Bartlett',           'northside',  7),
  ('southaven',         'Southaven, MS',      'southside',  8),
  ('mem-airport',       'MEM Airport',        'southside',  9)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'mem'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Nashville, TN
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-nashville','Downtown Nashville', 'central',   1),
  ('music-row',         'Midtown / Music Row','central',   2),
  ('the-gulch',         'The Gulch',          'central',   3),
  ('east-nashville',    'East Nashville',     'eastside',   4),
  ('germantown-nash',   'Germantown',         'northside',  5),
  ('twelve-south',      '12 South',           'southside',  6),
  ('brentwood',         'Brentwood',          'southside',  7),
  ('franklin',          'Franklin',           'southside',  8),
  ('bna-airport',       'BNA Airport',        'eastside',   9)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'bna'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Knoxville, TN
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-knoxville','Downtown Knoxville', 'central',   1),
  ('old-city',          'Old City',           'central',   2),
  ('ut-campus',         'UT Campus',          'central',   3),
  ('west-knoxville',    'West Knoxville',     'westside',   4),
  ('farragut',          'Farragut',           'westside',   5),
  ('north-knoxville',   'North Knoxville',    'northside',  6),
  ('maryville',         'Maryville',          'southside',  7)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'knx'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Chattanooga, TN
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-chatt',    'Downtown Chattanooga','central',  1),
  ('northshore',        'Northshore',         'northside',  2),
  ('southside-chatt',   'Southside',          'southside',  3),
  ('east-chatt',        'East Chattanooga',   'eastside',   4),
  ('lookout-mountain',  'Lookout Mountain',   'westside',   5),
  ('hixson',            'Hixson',             'northside',  6),
  ('ooltewah',          'Ooltewah',           'eastside',   7)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'cha'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Birmingham, AL
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-birmingham','Downtown Birmingham','central',  1),
  ('midtown-birmingham', 'Midtown Birmingham', 'central',  2),
  ('southside-bhm',     'Southside',          'southside',  3),
  ('homewood',          'Homewood',           'southside',  4),
  ('hoover',            'Hoover',             'southside',  5),
  ('vestavia-hills',    'Vestavia Hills',     'southside',  6),
  ('mountain-brook',    'Mountain Brook',     'eastside',   7),
  ('bhm-airport',       'BHM Airport',        'westside',   8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'bhm'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Montgomery, AL
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-montgomery','Downtown Montgomery','central', 1),
  ('old-cloverdale',    'Old Cloverdale',     'central',   2),
  ('east-montgomery',   'East Montgomery',    'eastside',   3),
  ('prattville',        'Prattville',         'northside',  4),
  ('millbrook',         'Millbrook',          'northside',  5),
  ('maxwell-afb',       'Maxwell AFB',        'westside',   6),
  ('mgm-airport',       'MGM Airport',        'westside',   7)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'mgm'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Houston, TX
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-houston',  'Downtown Houston',   'central',   1),
  ('midtown-houston',   'Midtown Houston',    'central',   2),
  ('montrose',          'Montrose',           'central',   3),
  ('the-heights',       'The Heights',        'northside',  4),
  ('east-end',          'East End',           'eastside',   5),
  ('third-ward',        'Third Ward',         'southside',  6),
  ('galleria',          'Galleria / Westheimer','westside', 7),
  ('sugar-land',        'Sugar Land',         'westside',   8),
  ('iah-airport',       'IAH Airport',        'northside',  9),
  ('hobby-airport',     'Hobby Airport',      'southside', 10)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'hou'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Dallas / Fort Worth, TX
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-dallas',   'Downtown Dallas',    'central',   1),
  ('uptown-dallas',     'Uptown Dallas',      'central',   2),
  ('deep-ellum',        'Deep Ellum',         'eastside',   3),
  ('oak-cliff',         'Oak Cliff',          'southside',  4),
  ('north-dallas',      'North Dallas',       'northside',  5),
  ('plano',             'Plano',              'northside',  6),
  ('fort-worth',        'Fort Worth',         'westside',   7),
  ('irving',            'Irving',             'westside',   8),
  ('dfw-airport',       'DFW Airport',        'northside',  9)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'dfw'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Charlotte, NC
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('uptown-charlotte',  'Uptown Charlotte',   'central',   1),
  ('south-end',         'South End',          'southside',  2),
  ('noda',              'NoDa',               'northside',  3),
  ('plaza-midwood',     'Plaza Midwood',      'eastside',   4),
  ('university-city',   'University City',    'northside',  5),
  ('ballantyne',        'Ballantyne',         'southside',  6),
  ('concord',           'Concord / Kannapolis','northside', 7),
  ('clt-airport',       'CLT Airport',        'westside',   8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'clt'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Chicago, IL
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('the-loop',          'The Loop',           'central',   1),
  ('river-north',       'River North',        'central',   2),
  ('wicker-park',       'Wicker Park',        'westside',   3),
  ('logan-square',      'Logan Square',       'westside',   4),
  ('south-side',        'South Side',         'southside',  5),
  ('hyde-park-chi',     'Hyde Park',          'southside',  6),
  ('rogers-park',       'Rogers Park',        'northside',  7),
  ('evanston',          'Evanston',           'northside',  8),
  ('ord-airport',       'ORD Airport',        'northside',  9),
  ('midway-airport',    'Midway Airport',     'southside', 10)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'chi'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Detroit, MI
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-detroit',  'Downtown Detroit',   'central',   1),
  ('midtown-detroit',   'Midtown Detroit',    'central',   2),
  ('corktown',          'Corktown',           'westside',   3),
  ('eastern-market',    'Eastern Market',     'eastside',   4),
  ('hamtramck',         'Hamtramck',          'northside',  5),
  ('dearborn',          'Dearborn',           'westside',   6),
  ('ann-arbor',         'Ann Arbor',          'westside',   7),
  ('dtw-airport',       'DTW Airport',        'southside',  8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'dtw'
ON CONFLICT (market_id, slug) DO NOTHING;

-- St. Louis, MO
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-stl',      'Downtown St. Louis', 'central',   1),
  ('the-grove',         'The Grove',          'central',   2),
  ('soulard',           'Soulard',            'southside',  3),
  ('south-grand',       'South Grand',        'southside',  4),
  ('clayton',           'Clayton',            'westside',   5),
  ('university-city',   'University City',    'westside',   6),
  ('north-county',      'North County',       'northside',  7),
  ('lambert-airport',   'Lambert Airport',    'northside',  8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'stl'
ON CONFLICT (market_id, slug) DO NOTHING;

-- Cincinnati, OH
INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
SELECT m.id, t.slug, t.name, t.cardinal, t.sort_order, TRUE
FROM markets m,
(VALUES
  ('downtown-cin',      'Downtown Cincinnati','central',   1),
  ('over-the-rhine',    'Over-the-Rhine',     'central',   2),
  ('clifton',           'Clifton',            'northside',  3),
  ('hyde-park-cin',     'Hyde Park',          'eastside',   4),
  ('norwood',           'Norwood',            'eastside',   5),
  ('newport-ky',        'Newport, KY',        'southside',  6),
  ('covington-ky',      'Covington, KY',      'southside',  7),
  ('cvg-airport',       'CVG Airport',        'southside',  8)
) AS t(slug, name, cardinal, sort_order)
WHERE m.slug = 'cin'
ON CONFLICT (market_id, slug) DO NOTHING;
