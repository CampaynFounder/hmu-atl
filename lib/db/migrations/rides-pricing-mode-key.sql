-- Stamp the pricing strategy on every ride at hold time.
-- Applied: 2026-05-11
--
-- Previously the UI had to re-resolve the driver's current cohort to know
-- which breakdown shape to render. That gives the wrong answer when a
-- driver moves between cohorts after the ride happened. Recording the
-- mode_key on the row itself makes the ride self-describing for life.
--
-- Backfill replays the resolver in SQL: explicit cohort assignment → global
-- default → 'legacy_full_fare' as last-resort fallback. Imperfect for rows
-- where the driver has changed cohort since the ride, but matches the
-- answer the live resolver would give right now — the same answer the UI
-- was implicitly using.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS pricing_mode_key TEXT;

CREATE INDEX IF NOT EXISTS idx_rides_pricing_mode_key
  ON rides(pricing_mode_key) WHERE pricing_mode_key IS NOT NULL;

-- Backfill
UPDATE rides r
SET pricing_mode_key = COALESCE(
  (SELECT pm.mode_key
     FROM pricing_cohort_assignments pca
     JOIN pricing_cohorts pc ON pc.id = pca.cohort_id
     JOIN pricing_modes pm ON pm.id = pc.pricing_mode_id
    WHERE pca.user_id = r.driver_id
      AND pca.expires_at IS NULL
      AND pm.enabled = true
    ORDER BY pca.effective_at DESC
    LIMIT 1),
  (SELECT mode_key FROM pricing_modes WHERE is_default_global = true AND enabled = true LIMIT 1),
  'legacy_full_fare'
)
WHERE r.pricing_mode_key IS NULL;
