-- Trip details: persist stops + surface trip_type on rides
-- Applies to: blast (stops + trip_type), direct (pickup/dropoff text), down-bad (no changes needed)

-- hmu_posts: stops column for blast bookings.
-- direct_booking and down_bad don't use stops; defaults to empty array.
ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS stops JSONB DEFAULT '[]'::jsonb;

-- rides: carry trip_type and stops through from the post so driver-view can return them.
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS trip_type TEXT NOT NULL DEFAULT 'one_way'
    CHECK (trip_type IN ('one_way', 'round_trip')),
  ADD COLUMN IF NOT EXISTS stops JSONB NOT NULL DEFAULT '[]'::jsonb;
