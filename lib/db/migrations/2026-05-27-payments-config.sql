-- Seed the global payments configuration row in platform_config.
-- Mirrors PAYMENTS_DEFAULTS in lib/payments/config.ts.
-- ON CONFLICT DO NOTHING so existing overrides are preserved on re-run.

INSERT INTO platform_config (config_key, config_value)
VALUES (
  'payments:global',
  '{
    "addOnReserve": {
      "mode": "menu_total_capped",
      "percentFloor": 0.25,
      "absoluteFloorDollars": 50
    },
    "legacyFullFare": {
      "visibleDepositMode": "deposit_percent",
      "visibleDepositPercent": 0.25,
      "visibleDepositFixed": 5,
      "visibleDepositMinimum": 5
    },
    "depositOnly": {
      "feeFloorCents": 150,
      "feePercent": 0.20,
      "depositMin": 5,
      "depositIncrement": 1,
      "depositMaxPctOfFare": 0.50,
      "extrasFeePercent": 0.20
    }
  }'::jsonb
)
ON CONFLICT (config_key) DO NOTHING;
