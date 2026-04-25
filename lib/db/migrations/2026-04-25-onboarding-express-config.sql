-- Adds the express driver onboarding config to platform_config.
-- The config row drives:
--   * which fields show in /onboarding express mode (deferred = moved to
--     post-onboarding "Pre-Ride To-Do" rather than removed from schema)
--   * the min-ride pill ladder ($10/$25/$50 tier defaults)
--   * default schedule (M-Sat 7am-10pm) + menu fees (stops/wait per min)
-- Admin tunes this via /admin/onboarding-config.
--
-- Applied: 2026-04-25 to production branch (still-rain-53751745).
-- Do not re-apply on the production branch.

INSERT INTO platform_config (config_key, config_value, updated_by) VALUES (
  'onboarding.driver_express',
  '{
    "enabled": true,
    "fields": {
      "govName": "deferred",
      "licensePlate": "deferred",
      "vehicleMakeModel": "required",
      "vehicleYear": "optional",
      "seatMap": "required",
      "videoIntro": "deferred",
      "adPhoto": "deferred",
      "riderPreferences": "deferred",
      "location": "deferred"
    },
    "pricingTiers": [
      {"label": "$10", "min": 10, "rate30": 15, "rate1h": 25, "rate2h": 45},
      {"label": "$25", "min": 25, "rate30": 25, "rate1h": 40, "rate2h": 70, "default": true},
      {"label": "$50", "min": 50, "rate30": 50, "rate1h": 75, "rate2h": 125}
    ],
    "stopsFee": 5,
    "waitPerMin": 1,
    "scheduleDefault": {
      "days": ["mon","tue","wed","thu","fri","sat"],
      "start": "07:00",
      "end": "22:00",
      "noticeRequired": "30min"
    }
  }'::jsonb,
  'claude-onboarding-express-seed'
)
ON CONFLICT (config_key) DO NOTHING;
