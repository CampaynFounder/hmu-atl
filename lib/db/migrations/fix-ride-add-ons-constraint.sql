-- Fix ride_add_ons status constraint to match actual code usage
-- Applied: 2026-04-13

-- Old constraint only allowed: pre_selected, confirmed, disputed, adjusted, removed
-- Code uses: pending_driver, rejected, removal_pending (all missing)
ALTER TABLE ride_add_ons DROP CONSTRAINT IF EXISTS ride_add_ons_status_check;
ALTER TABLE ride_add_ons ADD CONSTRAINT ride_add_ons_status_check
  CHECK (status IN ('pre_selected', 'pending_driver', 'confirmed', 'rejected', 'removal_pending', 'removed', 'disputed', 'adjusted'));
