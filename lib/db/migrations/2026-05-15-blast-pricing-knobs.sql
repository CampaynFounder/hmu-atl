-- Blast pricing knobs — extend platform_config['blast_matching_v1'] with the
-- new pricing fields used by the v2 fare formula:
--
--   minutes = distance_mi / assumed_mph * 60
--   fare    = base_fare + per_mile_rate * distance_mi + per_minute_rate * minutes
--   shown   = clamp(fare, minimum_fare, max_price)
--
-- Existing fields (default_price_dollars, price_per_mile_dollars, max_price_dollars)
-- stay in place. `default_price_dollars` keeps its old role as the UI's initial
-- price suggestion before distance is known; it no longer acts as the formula's
-- floor — `minimum_fare_dollars` does.
--
-- Per-market overrides written as `blast_matching_v1:market:{slug}` rows
-- (e.g. `blast_matching_v1:market:atl`); reader deep-merges over the global row.
-- This file only seeds the global row — market rows are created on first save
-- from /admin/blast-config.
--
-- Idempotent: re-running on an already-extended row is a no-op.

UPDATE platform_config
SET config_value = config_value
  || jsonb_build_object(
       'base_fare_dollars',       COALESCE(config_value->'base_fare_dollars',       to_jsonb(3.00)),
       'per_minute_cents',        COALESCE(config_value->'per_minute_cents',        to_jsonb(10)),
       'assumed_mph',             COALESCE(config_value->'assumed_mph',             to_jsonb(60)),
       'minimum_fare_dollars',    COALESCE(config_value->'minimum_fare_dollars',    to_jsonb(5.00))
     )
WHERE config_key = 'blast_matching_v1';

-- Verify with:
--   SELECT config_value->'base_fare_dollars',
--          config_value->'per_minute_cents',
--          config_value->'assumed_mph',
--          config_value->'minimum_fare_dollars'
--   FROM platform_config WHERE config_key = 'blast_matching_v1';
