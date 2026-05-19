-- Patch the blast_matching_v1 platform_config row to add fields that were
-- introduced after the original blast-v3 seed (2026-05-12-blast-booking.sql).
--
-- The original seed did not include:
--   filters.allow_home_location_fallback  (introduced with driver home-base UX)
--   filters.max_stale_location_minutes    (used to gate home-base fallback)
--
-- Because getPlatformConfig uses a shallow merge, a stored `filters` object
-- that lacks these keys causes the TypeScript defaults to be silently dropped.
-- This patch adds them via jsonb_set so existing filter knobs (max_distance_mi,
-- must_match_sex_preference, etc.) are preserved.
--
-- Idempotent: jsonb_set on an existing key is a no-op if the value hasn't changed.

UPDATE platform_config
SET config_value = jsonb_set(
      jsonb_set(
        config_value,
        '{filters,allow_home_location_fallback}',
        'true'::jsonb,
        true
      ),
      '{filters,max_stale_location_minutes}',
      '5'::jsonb,
      true
    )
WHERE config_key = 'blast_matching_v1';

-- Verify:
--   SELECT config_value->'filters'->'allow_home_location_fallback'
--     FROM platform_config WHERE config_key = 'blast_matching_v1';
-- Expected: true
