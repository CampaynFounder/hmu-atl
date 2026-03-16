-- Engagement & Personalization Tables
-- Supports comments, activity tracking, and lifecycle analytics

-- Ride comments (FB-style conversation)
CREATE TABLE IF NOT EXISTS ride_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (length(message) <= 500),
  comment_type VARCHAR(50) DEFAULT 'general' CHECK (comment_type IN ('offer_counter', 'question', 'update', 'general')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ride_comments_ride_id ON ride_comments(ride_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ride_comments_user_id ON ride_comments(user_id);

-- User activity tracking (for engagement analytics)
CREATE TABLE IF NOT EXISTS user_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name VARCHAR(100) NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_event_name ON user_activity(event_name);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON user_activity(created_at DESC);

-- Add last_active to users table (for churn detection)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for churn analysis
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);

-- Add updated_at to rides for activity tracking
ALTER TABLE rides ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- User preferences (for personalization)
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorite_drivers UUID[] DEFAULT ARRAY[]::UUID[],
  saved_routes JSONB DEFAULT '[]',
  notification_settings JSONB DEFAULT '{"push": true, "email": true, "sms": false}',
  preferred_vehicle_types VARCHAR(50)[] DEFAULT ARRAY['sedan'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Driver service areas
CREATE TABLE IF NOT EXISTS driver_service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID NOT NULL REFERENCES driver_profiles(id) ON DELETE CASCADE,
  area_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_service_areas_driver_id ON driver_service_areas(driver_profile_id);
CREATE INDEX IF NOT EXISTS idx_driver_service_areas_area_name ON driver_service_areas(area_name) WHERE is_active = true;

-- Lifecycle segments view (for easy querying)
CREATE OR REPLACE VIEW user_lifecycle_segments AS
SELECT
  u.id as user_id,
  u.clerk_id,
  u.profile_type,
  u.account_status,
  u.created_at as signup_date,
  u.last_active,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed') as completed_rides,
  MAX(r.ended_at) as last_ride_date,
  CASE
    WHEN COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed') = 0
      AND EXTRACT(DAY FROM NOW() - u.created_at) < 7
      THEN 'onboarding'
    WHEN COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed') BETWEEN 1 AND 4
      THEN 'activation'
    WHEN COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed') BETWEEN 5 AND 19
      THEN 'growth'
    WHEN COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed') >= 20
      THEN 'retention'
    ELSE 'new'
  END as lifecycle_stage,
  CASE
    WHEN MAX(r.ended_at) IS NOT NULL
      AND EXTRACT(DAY FROM NOW() - MAX(r.ended_at)) > 14
      THEN true
    ELSE false
  END as is_at_risk
FROM users u
LEFT JOIN rides r ON (u.id = r.rider_id OR u.id IN (
  SELECT user_id FROM driver_profiles WHERE id = r.driver_id
))
GROUP BY u.id, u.clerk_id, u.profile_type, u.account_status, u.created_at, u.last_active;

-- Comments
COMMENT ON TABLE ride_comments IS 'Ride conversation threads (FB-style)';
COMMENT ON TABLE user_activity IS 'Event tracking for engagement analytics';
COMMENT ON TABLE user_preferences IS 'User personalization settings';
COMMENT ON TABLE driver_service_areas IS 'Areas where drivers operate';
COMMENT ON VIEW user_lifecycle_segments IS 'User segmentation by lifecycle stage';
