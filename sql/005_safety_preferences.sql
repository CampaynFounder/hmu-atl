-- Safety & Matching Preferences
-- Supports gender, orientation, rating filters for rider/driver comfort

-- Add gender and orientation fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS lgbtq_friendly BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_check_status VARCHAR(50) DEFAULT 'pending'
  CHECK (background_check_status IN ('pending', 'approved', 'rejected', 'expired'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS background_check_date TIMESTAMP WITH TIME ZONE;

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_users_gender ON users(gender) WHERE gender IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_lgbtq ON users(lgbtq_friendly) WHERE lgbtq_friendly = true;
CREATE INDEX IF NOT EXISTS idx_users_verified ON users(is_verified) WHERE is_verified = true;

-- Safety preferences table (extends user_preferences)
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS driver_gender_pref VARCHAR(50)
  CHECK (driver_gender_pref IN ('no_preference', 'women_only', 'men_only', 'prefer_women', 'prefer_men'));
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS rider_gender_pref VARCHAR(50)
  CHECK (rider_gender_pref IN ('no_preference', 'women_only', 'men_only', 'prefer_women', 'prefer_men'));
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS require_lgbtq_friendly BOOLEAN DEFAULT false;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS min_driver_rating NUMERIC(3,2) DEFAULT 4.0
  CHECK (min_driver_rating >= 0 AND min_driver_rating <= 5.0);
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS min_rider_rating NUMERIC(3,2) DEFAULT 4.0
  CHECK (min_rider_rating >= 0 AND min_rider_rating <= 5.0);
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS require_verification BOOLEAN DEFAULT false;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS avoid_disputes BOOLEAN DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS share_trip_with_emergency_contact BOOLEAN DEFAULT false;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(200);
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS max_trip_distance_miles INTEGER;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS matching_priority VARCHAR(50) DEFAULT 'safety_first'
  CHECK (matching_priority IN ('safety_first', 'proximity_first', 'price_first', 'rating_first'));

-- Blocked users table (for safety)
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

-- Reported users table (for safety moderation)
CREATE TABLE IF NOT EXISTS user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES rides(id) ON DELETE SET NULL,
  reason VARCHAR(100) NOT NULL CHECK (reason IN (
    'inappropriate_behavior',
    'safety_concern',
    'harassment',
    'discrimination',
    'dangerous_driving',
    'fraud',
    'other'
  )),
  details TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_ride ON user_reports(ride_id);

-- Safety score view (for matching algorithm)
CREATE OR REPLACE VIEW user_safety_scores AS
SELECT
  u.id as user_id,
  u.clerk_id,
  u.gender,
  u.lgbtq_friendly,
  u.is_verified,
  u.background_check_status,
  COALESCE((
    SELECT AVG(r.rating)::numeric(3,2)
    FROM ratings r
    WHERE r.rated_user_id = u.id
  ), 5.0) as avg_rating,
  COALESCE((
    SELECT COUNT(*)
    FROM user_reports ur
    WHERE ur.reported_id = u.id
      AND ur.status != 'dismissed'
  ), 0) as active_reports,
  COALESCE((
    SELECT COUNT(*)
    FROM blocked_users bu
    WHERE bu.blocked_id = u.id
  ), 0) as times_blocked,
  COALESCE((
    SELECT COUNT(*)
    FROM disputes d
    WHERE (d.reporter_id = u.id OR d.reported_id = u.id)
      AND d.status != 'resolved'
  ), 0) as active_disputes,
  CASE
    WHEN u.background_check_status = 'approved' AND u.is_verified THEN 100
    WHEN u.background_check_status = 'approved' THEN 80
    WHEN u.is_verified THEN 60
    ELSE 40
  END as verification_score,
  CASE
    WHEN COALESCE((SELECT AVG(r.rating) FROM ratings r WHERE r.rated_user_id = u.id), 5.0) >= 4.8 THEN 100
    WHEN COALESCE((SELECT AVG(r.rating) FROM ratings r WHERE r.rated_user_id = u.id), 5.0) >= 4.5 THEN 80
    WHEN COALESCE((SELECT AVG(r.rating) FROM ratings r WHERE r.rated_user_id = u.id), 5.0) >= 4.0 THEN 60
    ELSE 40
  END as rating_score,
  CASE
    WHEN COALESCE((SELECT COUNT(*) FROM user_reports WHERE reported_id = u.id AND status != 'dismissed'), 0) > 0 THEN 0
    WHEN COALESCE((SELECT COUNT(*) FROM disputes WHERE (reporter_id = u.id OR reported_id = u.id) AND status != 'resolved'), 0) > 0 THEN 20
    ELSE 100
  END as safety_score
FROM users u;

-- Comments
COMMENT ON TABLE blocked_users IS 'User blocking for safety (mutual exclusion from matching)';
COMMENT ON TABLE user_reports IS 'Safety reports for moderation review';
COMMENT ON VIEW user_safety_scores IS 'Computed safety scores for matching algorithm';

COMMENT ON COLUMN users.gender IS 'User gender (for matching preferences)';
COMMENT ON COLUMN users.pronouns IS 'User pronouns (displayed on profile)';
COMMENT ON COLUMN users.lgbtq_friendly IS 'User identifies as LGBTQ+ friendly';
COMMENT ON COLUMN users.is_verified IS 'User has completed video verification';
COMMENT ON COLUMN users.background_check_status IS 'Background check status (approved/rejected/pending)';

COMMENT ON COLUMN user_preferences.driver_gender_pref IS 'Rider preference for driver gender';
COMMENT ON COLUMN user_preferences.rider_gender_pref IS 'Driver preference for rider gender';
COMMENT ON COLUMN user_preferences.require_lgbtq_friendly IS 'Require match to be LGBTQ+ friendly';
COMMENT ON COLUMN user_preferences.min_driver_rating IS 'Minimum acceptable driver rating (0-5)';
COMMENT ON COLUMN user_preferences.min_rider_rating IS 'Minimum acceptable rider rating (0-5)';
COMMENT ON COLUMN user_preferences.matching_priority IS 'Primary factor for match ranking (safety/proximity/price/rating)';
