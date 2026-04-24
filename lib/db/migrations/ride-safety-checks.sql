-- Ride Safety Checks
-- Periodic "Are you OK?" prompts during active rides + anomaly/distress event log.
-- Three layers: scheduled check-ins (ride_safety_checks), server-side anomaly
-- detection + user-initiated distress (ride_safety_events).
--
-- User opt-out + interval override lives on user_preferences so riders and
-- drivers share one settings surface.
--
-- Apply with: psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/ride-safety-checks.sql

-- ============================================================
-- 1. Per-user settings (extend user_preferences)
-- ============================================================
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS safety_checks_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS safety_check_interval_minutes INTEGER;

-- NULL means "use platform default for my profile type (rider vs driver)".
-- Clamped at write time by API layer — raw values in DB for audit.

-- ============================================================
-- 2. Check-in prompt log
-- Every scheduled or anomaly-triggered prompt creates a row. Response
-- (ok / alert / ignored) is written when the user taps or the 60s
-- auto-dismiss fires.
-- ============================================================
CREATE TABLE IF NOT EXISTS ride_safety_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party TEXT NOT NULL CHECK (party IN ('rider', 'driver')),
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'anomaly_followup', 'manual_admin')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  response TEXT CHECK (response IN ('ok', 'alert', 'ignored')),
  location_lat NUMERIC(10,8),
  location_lng NUMERIC(11,8),
  related_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_safety_checks_ride ON ride_safety_checks(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_safety_checks_user_sent ON ride_safety_checks(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_ride_safety_checks_pending ON ride_safety_checks(ride_id, party) WHERE response IS NULL;

-- ============================================================
-- 3. Safety event log
-- Admin-actionable records: anomaly detections, distress button taps,
-- ignored-streak flags. Live map ring lights up while admin_resolved_at
-- is NULL.
-- ============================================================
CREATE TABLE IF NOT EXISTS ride_safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'off_route',
    'stopped_too_long',
    'gps_silence',
    'wrong_direction',
    'speed_extreme',
    'check_in_alert',
    'distress_admin',
    'distress_911',
    'distress_contact',
    'ignored_streak'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'high', 'critical')),
  party TEXT NOT NULL CHECK (party IN ('rider', 'driver', 'system')),
  triggered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  location_lat NUMERIC(10,8),
  location_lng NUMERIC(11,8),
  admin_resolved_at TIMESTAMPTZ,
  admin_resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ride_safety_events_ride ON ride_safety_events(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_safety_events_open
  ON ride_safety_events(detected_at DESC) WHERE admin_resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ride_safety_events_severity
  ON ride_safety_events(severity, detected_at DESC) WHERE admin_resolved_at IS NULL;

-- Back-link check -> event once the FK target exists.
ALTER TABLE ride_safety_checks
  DROP CONSTRAINT IF EXISTS ride_safety_checks_related_event_fk;
ALTER TABLE ride_safety_checks
  ADD CONSTRAINT ride_safety_checks_related_event_fk
  FOREIGN KEY (related_event_id) REFERENCES ride_safety_events(id) ON DELETE SET NULL;

-- ============================================================
-- 4. Platform defaults + anomaly thresholds
-- One JSON blob under config_key='ride_safety'. Admin /admin/safety/config
-- (future) edits this; server reads via lib/platform-config/get.ts.
-- ============================================================
INSERT INTO platform_config (config_key, config_value, updated_by)
VALUES (
  'ride_safety',
  '{
    "enabled": true,
    "default_interval_minutes_rider": 10,
    "default_interval_minutes_driver": 15,
    "min_interval_minutes": 5,
    "max_interval_minutes": 30,
    "first_check_delay_minutes": 5,
    "prompt_auto_dismiss_seconds": 60,
    "ignored_streak_threshold": 3,
    "anomaly": {
      "off_route_distance_meters": 500,
      "off_route_duration_seconds": 180,
      "stopped_duration_seconds": 240,
      "stopped_radius_meters": 20,
      "gps_silence_seconds": 90,
      "wrong_direction_duration_seconds": 120,
      "speed_max_mph": 85
    }
  }'::jsonb,
  'ride-safety-checks-seed'
)
ON CONFLICT (config_key) DO NOTHING;
