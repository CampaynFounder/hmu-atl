-- Cancellation cleanup + safety scheduler hygiene (2026-05-09)
--
-- Two independent fixes that ship together because they touch the same
-- safety subsystem:
--
-- 1. Allow `'ride_cancelled'` as a `ride_safety_checks.response` value so
--    that cancel-cascade can mark pending check-ins as resolved-by-cancel
--    rather than leaving them as NULL forever (which keeps them visible
--    in the admin pending queue and can falsely contribute to
--    ignored-streak counts).
--
-- 2. The safety scheduler / anomaly detector were querying
--    `WHERE status = 'in_progress'`, but rides never use that status —
--    the active value is `'active'`. The query has been silently
--    matching zero rows. Code fix in lib/safety/scheduler.ts and
--    lib/safety/anomaly.ts ships in the same PR.
--
-- Idempotent. Safe to apply on staging then prod.

ALTER TABLE ride_safety_checks
  DROP CONSTRAINT IF EXISTS ride_safety_checks_response_check;

ALTER TABLE ride_safety_checks
  ADD CONSTRAINT ride_safety_checks_response_check
  CHECK (response IN ('ok', 'alert', 'ignored', 'ride_cancelled'));
