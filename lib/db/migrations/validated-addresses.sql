-- Migration: Validated Addresses & Geo-Verification
-- Adds columns for address verification at HERE/End Ride and ride analytics

-- Geo-verification: driver GPS at HERE tap vs validated pickup
ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_here_lat NUMERIC(10,8);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_here_lng NUMERIC(11,8);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS here_proximity_ft INTEGER;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS here_verified BOOLEAN;

-- Geo-verification: driver GPS at End Ride vs validated dropoff
ALTER TABLE rides ADD COLUMN IF NOT EXISTS end_proximity_ft INTEGER;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS end_verified BOOLEAN;

-- Ride analytics: calculated from GPS trail at ride end
ALTER TABLE rides ADD COLUMN IF NOT EXISTS total_distance_miles NUMERIC(8,2);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS total_duration_minutes INTEGER;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS rate_per_mile NUMERIC(8,2);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS rate_per_minute NUMERIC(8,2);
