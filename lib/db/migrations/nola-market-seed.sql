-- NOLA market expansion — seed data only (no schema changes)
-- Applied to Neon project still-rain-53751745 on 2026-04-20 via Neon MCP.
--
-- What this does:
--   1. Inserts New Orleans market row with status='setup' (not public-facing).
--   2. Inserts 12 market_areas with cardinal groupings (french-quarter, cbd, etc.).
--   3. Clones all ATL content_variants as NOLA drafts with text swaps
--      (Atlanta→New Orleans, ATL→N.O.). Admin reviews + publishes in /admin/funnel.
--   4. Clones ATL personas into NOLA.
--   5. Clones ATL page_section_layouts into NOLA.
--   6. pricing_config, fee_config, launch_offer_config left NULL/empty → NOLA
--      inherits ATL/global defaults until overridden in admin.
--
-- NO ATL data is modified. Rollback is pure DELETE where market_id = <nola-id>.

DO $$
DECLARE
  atl_id   UUID := '69957e98-95ae-4e04-af0f-c29bc103f773';
  nola_id  UUID;
BEGIN
  -- 1. Insert market — idempotent via slug
  INSERT INTO markets (
    slug, name, subdomain, state, timezone, status,
    center_lat, center_lng, radius_miles,
    sms_did, sms_area_code, min_drivers_to_launch,
    fee_config, launch_offer_config, branding
  ) VALUES (
    'nola',
    'New Orleans',
    'nola',
    'LA',
    'America/Chicago',
    'setup',
    29.9511,
    -90.0715,
    30,
    '4049137292',  -- TODO: swap to 504 DID once purchased
    '504',
    5,             -- pilot threshold
    '{}'::jsonb,
    '{}'::jsonb,
    '{"slang":{"match":"HMU","confirm":"Pull Up"},"tagline":"Make Bank Trips not Blank Trips"}'::jsonb
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    subdomain = EXCLUDED.subdomain,
    timezone = EXCLUDED.timezone,
    center_lat = EXCLUDED.center_lat,
    center_lng = EXCLUDED.center_lng,
    radius_miles = EXCLUDED.radius_miles,
    updated_at = NOW()
  RETURNING id INTO nola_id;

  IF nola_id IS NULL THEN
    SELECT id INTO nola_id FROM markets WHERE slug = 'nola';
  END IF;

  -- 2. Insert 12 market_areas (cardinal groupings, per taxonomy decision 2026-04-20)
  INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active) VALUES
    (nola_id, 'french-quarter',    'French Quarter',     'central',   1,   TRUE),
    (nola_id, 'cbd',                'CBD',                'central',   2,   TRUE),
    (nola_id, 'mid-city',           'Mid-City',           'central',   3,   TRUE),
    (nola_id, 'marigny-bywater',    'Marigny / Bywater',  'eastside',  4,   TRUE),
    (nola_id, 'new-orleans-east',   'New Orleans East',   'eastside',  5,   TRUE),
    (nola_id, 'uptown',             'Uptown',             'westside',  6,   TRUE),
    (nola_id, 'garden-district',    'Garden District',    'westside',  7,   TRUE),
    (nola_id, 'kenner',             'Kenner',             'westside',  8,   TRUE),
    (nola_id, 'msy-airport',        'MSY Airport',        'westside',  9,   TRUE),
    (nola_id, 'lakeview',           'Lakeview',           'northside', 10,  TRUE),
    (nola_id, 'metairie',           'Metairie',           'northside', 11,  TRUE),
    (nola_id, 'algiers-westbank',   'Algiers / Westbank', 'southside', 12,  TRUE),
    -- Cardinal macros so "anywhere on the X" is pickable too
    (nola_id, 'central',            'Central',            'central',   100, TRUE),
    (nola_id, 'eastside',           'Eastside',           'eastside',  101, TRUE),
    (nola_id, 'westside',           'Westside',           'westside',  102, TRUE),
    (nola_id, 'northside',          'Northside',          'northside', 103, TRUE),
    (nola_id, 'southside',          'Southside',          'southside', 104, TRUE)
  ON CONFLICT (market_id, slug) DO NOTHING;

  -- 3. Clone ATL content_variants as NOLA drafts with text swaps.
  --    Only REPLACE() known display strings; URLs with 'atl.' left alone (they'd
  --    need manual review anyway, which is what status='draft' forces).
  INSERT INTO content_variants (
    zone_id, market_id, variant_name, content, status,
    seo_keywords, utm_targets, weight, created_by, updated_by
  )
  SELECT
    zone_id,
    nola_id,
    variant_name,
    -- Text swap on JSONB: serialize → replace → reparse. Safe for any JSON shape.
    REPLACE(
      REPLACE(
        REPLACE(content::text, 'Atlanta', 'New Orleans'),
        'ATL',
        'N.O.'
      ),
      'atl.hmucashride.com',
      'nola.hmucashride.com'
    )::jsonb,
    'draft',              -- force admin review before public
    seo_keywords,
    utm_targets,
    weight,
    created_by,
    updated_by
  FROM content_variants
  WHERE market_id = atl_id
  ON CONFLICT DO NOTHING;

  -- 4. Clone ATL personas
  INSERT INTO personas (
    slug, label, description, audience, market_id, color, is_active, sort_order
  )
  SELECT
    slug, label, description, audience, nola_id, color, is_active, sort_order
  FROM personas
  WHERE market_id = atl_id
  ON CONFLICT DO NOTHING;

  -- 5. Clone ATL page_section_layouts
  INSERT INTO page_section_layouts (
    page_slug, funnel_stage_slug, market_id, sections, created_by, updated_by
  )
  SELECT
    page_slug, funnel_stage_slug, nola_id, sections, created_by, updated_by
  FROM page_section_layouts
  WHERE market_id = atl_id
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'NOLA market seeded: id=%', nola_id;
END $$;
