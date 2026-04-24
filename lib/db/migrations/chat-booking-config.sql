-- Chat Booking admin config — global kill switch + per-driver overrides +
-- generative/deterministic knobs. Ships DISABLED so chat-booking turns off
-- on apply until admin flips it in /admin/chat-booking.
--
-- Applied: 2026-04-24 to production branch (still-rain-53751745, neondb).
-- Config resolution lives in lib/chat/config.ts.

INSERT INTO platform_config (config_key, config_value, updated_by)
VALUES (
  'chat_booking',
  '{
    "enabled": false,
    "driver_overrides": {},
    "generative": {
      "enabled": true,
      "model": "gpt-4o-mini",
      "temperature": 0.3,
      "system_prompt_override": null,
      "tools_enabled": {
        "extract_booking": true,
        "confirm_details": true,
        "calculate_route": true,
        "compare_pricing": true,
        "analyze_sentiment": true
      }
    },
    "deterministic": {
      "enforce_min_price": true,
      "require_payment_slot": true,
      "buffer_minutes": 10,
      "re_resolve_time_from_text": true
    }
  }'::jsonb,
  'chat-booking-config-seed'
)
ON CONFLICT (config_key) DO NOTHING;
