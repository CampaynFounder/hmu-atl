-- SMS Templates — admin-editable bodies for transactional SMS.
-- Sender code (lib/sms/templates.ts) reads from this table and falls back to
-- the original hardcoded literal in lib/sms/textbee.ts if a row is missing,
-- the variables config is malformed, or the DB read fails. event_key matches
-- the existing sms_log.event_type values so the admin UI can join history.
--
-- Variables: bodies may interpolate {{varName}} placeholders. The `variables`
-- column is the whitelist of names a template is allowed to reference; the
-- renderer rejects edits that include unknown placeholders.
--
-- event_key whitelist: the CHECK below mirrors SMS_EVENT_KEYS in
-- lib/sms/templates.ts. Adding a new transactional SMS means updating BOTH
-- (the TS const for compile-time safety on senders, the SQL CHECK to prevent
-- drift via direct DB inserts). Drop+re-add the constraint on schema change.

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

-- Whitelist of allowed event_key values. Re-applied idempotently so re-runs of
-- this migration (and additions to the list) take effect on existing prod tables.
ALTER TABLE sms_templates DROP CONSTRAINT IF EXISTS sms_templates_event_key_check;
ALTER TABLE sms_templates ADD CONSTRAINT sms_templates_event_key_check
  CHECK (event_key IN (
    -- transactional ride flow
    'new_booking',
    'ride_accepted',
    'generic',
    'booking_accepted',
    'booking_declined',
    'driver_otw',
    'driver_here',
    -- standalone transactional
    'hmu_received',
    'eta_nudge',
    'welcome_driver',
    'safety_intro_driver',
    'welcome_rider',
    'safety_intro_rider',
    'payout_ready',
    'balance_available',
    'maintenance_back_live',
    -- activation nudges
    'driver_payout_setup',
    'driver_deposit_floor',
    'driver_location_enabled',
    'driver_areas',
    'driver_pricing',
    'driver_media',
    'driver_handle',
    'driver_display_name',
    'driver_share_link_promo',
    'driver_profile_views_promo',
    'driver_vehicle_info',
    'driver_visible',
    'rider_payment_method',
    'rider_display_name',
    'rider_avatar',
    'rider_recent_signin',
    'rider_has_activity',
    -- mid-ride quick messages
    'quick_rider_eta',
    'quick_rider_wya',
    'quick_rider_here',
    'quick_rider_late',
    'quick_rider_spot',
    'quick_driver_otw',
    'quick_driver_5min',
    'quick_driver_here',
    'quick_driver_cantfind',
    'quick_driver_pulling_up'
  ));

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
  ),
  -- ── Standalone transactional ──
  (
    'hmu_received',
    'rider',
    'Driver sends a directed HMU to a rider (driver-to-rider interest signal).',
    'Hey {{firstName}}! {{driverName}} said HMU on HMU ATL for Cash Rides{{areaPart}}. Link Up atl.hmucashride.com/rider/home',
    ARRAY['firstName','driverName','areaPart']
  ),
  (
    'eta_nudge',
    'driver',
    'Rider nudges driver when ETA goes stale (>90s no GPS update during OTW/HERE/confirming).',
    'HMU ATL: {{riderName}} is waiting and can''t see your ETA. Open HMU so they can track your pickup. atl.hmucashride.com/ride/{{rideId}}',
    ARRAY['riderName','rideId']
  ),
  (
    'welcome_driver',
    'driver',
    'Driver completes onboarding — welcome SMS with driver guide link.',
    '{{firstName}}, welcome to HMU ATL! We''re Atlanta-based and built this for you. See how drivers get paid: atl.hmucashride.com/guide/driver',
    ARRAY['firstName']
  ),
  (
    'safety_intro_driver',
    'driver',
    'Driver completes onboarding — follow-up safety intro SMS.',
    'Safety on HMU is non-negotiable. How we keep drivers safe (deposits, GPS, check-ins, women-rider matching): atl.hmucashride.com/safety/driver',
    ARRAY[]::text[]
  ),
  (
    'welcome_rider',
    'rider',
    'Rider completes onboarding — welcome SMS with rider guide link.',
    '{{firstName}}, welcome to HMU ATL! We''re Atlanta-based and value every rider''s voice. See how booking works: atl.hmucashride.com/guide/rider',
    ARRAY['firstName']
  ),
  (
    'safety_intro_rider',
    'rider',
    'Rider completes onboarding — follow-up safety intro SMS.',
    'Safety first. How we keep riders safe (women-driver filter, deposit refunds, GPS, mid-ride check-ins): atl.hmucashride.com/safety/rider',
    ARRAY[]::text[]
  ),
  (
    'payout_ready',
    'driver',
    'Stripe Connect webhook confirms first-time payout-ready transition (charges + payouts enabled).',
    'HMU ATL: {{firstName}}, your payout account is verified! You can now cash out your earnings. atl.hmucashride.com/driver/home',
    ARRAY['firstName']
  ),
  (
    'balance_available',
    'driver',
    'Stripe balance.available webhook: driver''s Connect funds cleared and are now cashable. Fires once per advance of the watermark.',
    'HMU ATL: {{firstName}}, your ${{clearedDollars}} just cleared! Cash out at atl.hmucashride.com/driver/home',
    ARRAY['firstName','clearedDollars']
  ),
  (
    'maintenance_back_live',
    'any',
    'Admin-triggered blast to maintenance waitlist after a downtime window — app is back online. Admin can override the body at send time; this row is the default.',
    'HMU ATL is back live — open the app and run it up. atl.hmucashride.com',
    ARRAY[]::text[]
  ),
  -- ── Activation nudges (admin-triggered) ──
  (
    'driver_payout_setup',
    'driver',
    'Activation nudge: driver hasn''t completed Stripe Connect onboarding.',
    '{{name}} — finish your payout setup so we can pay you out the second a ride caps. Takes 2 min: atl.hmucashride.com/driver/payout-setup',
    ARRAY['name']
  ),
  (
    'driver_deposit_floor',
    'driver',
    'Activation nudge: driver hasn''t set a deposit_floor.',
    '{{name}}, set your deposit floor in profile so riders can lock in rides at amounts you guarantee. 30s: atl.hmucashride.com/driver/profile',
    ARRAY['name']
  ),
  (
    'driver_location_enabled',
    'driver',
    'Activation nudge: driver hasn''t enabled live location.',
    '{{name}}, turn on live location so riders see how close you are. They book what''s nearest: atl.hmucashride.com/driver/home',
    ARRAY['name']
  ),
  (
    'driver_areas',
    'driver',
    'Activation nudge: driver hasn''t set coverage areas.',
    'Yo {{name}} — add the areas you cover so riders find you in the feed: atl.hmucashride.com/driver/profile',
    ARRAY['name']
  ),
  (
    'driver_pricing',
    'driver',
    'Activation nudge: driver has no pricing set.',
    '{{name}}, riders pick drivers with prices set. Add yours so you stop getting skipped: atl.hmucashride.com/driver/profile',
    ARRAY['name']
  ),
  (
    'driver_media',
    'driver',
    'Activation nudge: driver has no profile photo or video.',
    'Riders book drivers they can SEE. 30 sec selfie video and you show up at the top: atl.hmucashride.com/driver/profile',
    ARRAY[]::text[]
  ),
  (
    'driver_handle',
    'driver',
    'Activation nudge: driver has no @handle set.',
    '{{name}}, lock in your @handle so people can share your HMU page: atl.hmucashride.com/driver/profile',
    ARRAY['name']
  ),
  (
    'driver_display_name',
    'driver',
    'Activation nudge: driver has no display name.',
    'Quick one — set your display name on HMU so riders know who they''re booking: atl.hmucashride.com/driver/profile',
    ARRAY[]::text[]
  ),
  (
    'driver_share_link_promo',
    'driver',
    'Activation promo: payment-ready driver with handle — encourage them to share their HMU link.',
    'Yo {{name}} — your link is {{profileUrl}}. Every ride booked there is 100% deposit-guaranteed; collect the rest cash on pull up. Share it.',
    ARRAY['name','profileUrl']
  ),
  (
    'driver_profile_views_promo',
    'driver',
    'Activation promo: synthetic "your profile got viewed N times today" social-proof nudge with shareable link. viewCount is generated 1–5 at send time.',
    'Yo {{name}} — your profile got viewed {{viewCount}} times today. Share {{profileUrl}} to lock those riders before they pick someone else.',
    ARRAY['name','viewCount','profileUrl']
  ),
  (
    'driver_vehicle_info',
    'driver',
    'Activation nudge: driver hasn''t set vehicle info (make/model/plate).',
    '{{name}} — add your car (make/model + plate) so riders know what to look for: atl.hmucashride.com/driver/profile',
    ARRAY['name']
  ),
  (
    'driver_visible',
    'driver',
    'Activation nudge: driver profile is hidden from rider feed.',
    'Heads up {{name}}: your profile is hidden from riders. Flip it visible so the bookings come in.',
    ARRAY['name']
  ),
  (
    'rider_payment_method',
    'rider',
    'Activation nudge: rider has no saved payment method.',
    '{{name}}, save a card so booking takes one tap. Small deposit locks the ride, rest is cash to driver: atl.hmucashride.com/rider/profile',
    ARRAY['name']
  ),
  (
    'rider_display_name',
    'rider',
    'Activation nudge: rider has no display name.',
    'Quick one — add a display name on HMU so drivers know who they''re picking up: atl.hmucashride.com/rider/profile',
    ARRAY[]::text[]
  ),
  (
    'rider_avatar',
    'rider',
    'Activation nudge: rider has no profile photo.',
    'Drivers vibe-check rider profiles before accepting. Drop a photo so you don''t get skipped: atl.hmucashride.com/rider/profile',
    ARRAY[]::text[]
  ),
  (
    'rider_recent_signin',
    'rider',
    'Activation nudge: rider hasn''t signed in within 14 days.',
    '{{name}}, miss us? Cheap rides where you set the price. Open the app and post a ride: atl.hmucashride.com/rider',
    ARRAY['name']
  ),
  (
    'rider_has_activity',
    'rider',
    'Activation nudge: rider is payment-ready but has never posted a ride.',
    '{{name}}, you''re payment-ready on HMU but haven''t booked yet. Post a ride and let drivers come to you: atl.hmucashride.com/rider',
    ARRAY['name']
  ),
  -- ── Mid-ride quick messages ──
  -- name = sender's display name (driver or rider depending on direction).
  -- rideId is the UUID used in the deep-link. extra is the rider's typed
  -- location string for rider_spot.
  (
    'quick_rider_eta',
    'driver',
    'Rider taps "ETA?" during OTW/HERE/confirming — asks driver for an ETA.',
    'HMU ATL: {{name}} wants your ETA. Open HMU: atl.hmucashride.com/ride/{{rideId}}',
    ARRAY['name','rideId']
  ),
  (
    'quick_rider_wya',
    'driver',
    'Rider taps "WYA?" — asks where the driver is.',
    'HMU ATL: {{name}}: Where you at? atl.hmucashride.com/ride/{{rideId}}',
    ARRAY['name','rideId']
  ),
  (
    'quick_rider_here',
    'driver',
    'Rider taps "I''m here" — they''ve arrived at the pickup spot.',
    'HMU ATL: {{name}} is at the pickup spot. atl.hmucashride.com/ride/{{rideId}}',
    ARRAY['name','rideId']
  ),
  (
    'quick_rider_late',
    'driver',
    'Rider taps "Running late" — driver should hold tight.',
    'HMU ATL: {{name}} is running a few min late — sit tight',
    ARRAY['name']
  ),
  (
    'quick_rider_spot',
    'driver',
    'Rider taps "Share my spot" — sends a typed location string to driver.',
    'HMU ATL: {{name}} shared their location: {{extra}}',
    ARRAY['name','extra']
  ),
  (
    'quick_driver_otw',
    'rider',
    'Driver taps "OTW" quick-message during ride flow (separate from the main driver_otw status flip).',
    'HMU ATL: {{name}} is on the way! Track ETA: atl.hmucashride.com/ride/{{rideId}}',
    ARRAY['name','rideId']
  ),
  (
    'quick_driver_5min',
    'rider',
    'Driver taps "5 min away" — rider should head to pickup.',
    'HMU ATL: {{name}} is about 5 min away — head to the pickup spot!',
    ARRAY['name']
  ),
  (
    'quick_driver_here',
    'rider',
    'Driver taps "I''m here" quick-message (separate from the main driver_here status flip).',
    'HMU ATL: {{name}} is HERE! Head to the car. atl.hmucashride.com/ride/{{rideId}}',
    ARRAY['name','rideId']
  ),
  (
    'quick_driver_cantfind',
    'rider',
    'Driver taps "Can''t find you" — asks rider to share location.',
    'HMU ATL: {{name}} can''t find you at the pickup. Open HMU and share your spot: atl.hmucashride.com/ride/{{rideId}}',
    ARRAY['name','rideId']
  ),
  (
    'quick_driver_pulling_up',
    'rider',
    'Driver taps "Pulling up now" — rider should be ready.',
    'HMU ATL: {{name}} is pulling up now — be ready!',
    ARRAY['name']
  )
ON CONFLICT (event_key) DO NOTHING;
