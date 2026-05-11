-- SMS Templates — admin-editable bodies for transactional SMS.
-- Sender code (lib/sms/templates.ts) reads from this table and falls back to
-- the original hardcoded literal in lib/sms/textbee.ts if a row is missing,
-- the variables config is malformed, or the DB read fails. event_key matches
-- the existing sms_log.event_type values so the admin UI can join history.
--
-- Variables: bodies may interpolate {{varName}} placeholders. The `variables`
-- column is the whitelist of names a template is allowed to reference; the
-- renderer rejects edits that include unknown placeholders.

CREATE TABLE IF NOT EXISTS sms_templates (
  event_key TEXT PRIMARY KEY,
  audience TEXT NOT NULL CHECK (audience IN ('driver', 'rider', 'admin', 'any')),
  trigger_description TEXT NOT NULL,
  body TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_audience ON sms_templates(audience);

-- Seed every event_key currently emitted by lib/sms/textbee.ts notifier helpers.
-- Bodies match the literals in textbee.ts as of 2026-05-11 so a flip to
-- DB-backed rendering produces identical SMS for an unmodified template.
-- Idempotent on event_key so re-runs don't clobber edits made in the admin UI.

INSERT INTO sms_templates (event_key, audience, trigger_description, body, variables) VALUES
  (
    'new_booking',
    'driver',
    'Rider requests a ride from this driver (booking received).',
    'HMU ATL: Ride from {{riderName}}.{{priceLine}}{{destLine}}{{timeLine}} {{link}}',
    ARRAY['riderName','priceLine','destLine','timeLine','link']
  ),
  (
    'ride_accepted',
    'driver',
    'Rider confirmed payment on a booking the driver accepted.',
    'HMU ATL: {{riderName}} confirmed payment. Check the app for pickup details. atl.hmucashride.com/driver/home',
    ARRAY['riderName']
  ),
  (
    'generic',
    'driver',
    'Generic driver SMS (legacy catch-all helper, wraps custom text).',
    'HMU ATL: {{text}}',
    ARRAY['text']
  ),
  (
    'booking_accepted',
    'rider',
    'Driver accepted the rider''s booking.',
    'HMU ATL: {{driverName}} accepted your ride! Open the app to tap Pull Up and share your location. atl.hmucashride.com/ride/{{rideId}}',
    ARRAY['driverName','rideId']
  ),
  (
    'booking_declined',
    'rider',
    'Driver passed on the rider''s booking.',
    'HMU ATL: {{driverName}} passed on your request. Try another driver or post to the feed. atl.hmucashride.com/rider/browse',
    ARRAY['driverName']
  ),
  (
    'driver_otw',
    'rider',
    'Driver tapped OTW — heading to pickup.',
    'HMU ATL: {{driverName}} is OTW to you now! Track them in the app.',
    ARRAY['driverName']
  ),
  (
    'driver_here',
    'rider',
    'Driver tapped HERE — arrived at pickup.',
    'HMU ATL: {{driverName}} is HERE! Head to the car.',
    ARRAY['driverName']
  )
ON CONFLICT (event_key) DO NOTHING;
