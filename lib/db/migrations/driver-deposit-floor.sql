-- Phase B — driver-set deposit floor.
-- Per the locked launch flow: in deposit_only mode the DRIVER picks the
-- deposit (within admin bounds in pricing_modes.config). This column stores
-- the driver's personal floor; per-ride overrides at offer time can come
-- later in their own column on the rides table or driver_interest.
--
-- NULL means "use the admin floor from pricing_modes.config".

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS deposit_floor NUMERIC(10,2) DEFAULT NULL;

COMMENT ON COLUMN driver_profiles.deposit_floor IS
  'Driver-set minimum deposit (deposit_only pricing mode). Must satisfy admin band in pricing_modes.config. NULL = use admin floor.';
