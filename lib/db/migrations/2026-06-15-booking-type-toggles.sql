-- ============================================================
-- Per-market booking-type rollout switches
--   Generalizes the existing markets.blast_enabled dark-launch flag
--   to the other three booking flows so each type can be rolled out
--   market-by-market from the superadmin (/admin/booking-types).
--
--   direct_enabled   defaults TRUE  — Direct is the live core flow; do
--                                     not regress existing markets.
--   down_bad_enabled defaults FALSE — rolling out
--   delivery_enabled defaults FALSE — rolling out
--   blast_enabled    already exists (2026-05-12-blast-booking.sql)
-- ============================================================

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS direct_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS down_bad_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE;
