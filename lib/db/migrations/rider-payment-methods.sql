-- rider_payment_methods was originally created via Neon MCP in March 2026
-- and was never checked into a migration file.
-- This file recreates it safely on any branch where it is missing (e.g. staging).

CREATE TABLE IF NOT EXISTS rider_payment_methods (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id                  UUID        REFERENCES users(id),
  stripe_payment_method_id  TEXT        NOT NULL,
  type                      TEXT        NOT NULL,
  brand                     TEXT,
  last4                     TEXT        NOT NULL,
  exp_month                 INTEGER,
  exp_year                  INTEGER,
  is_default                BOOLEAN     DEFAULT false,
  apple_pay                 BOOLEAN     DEFAULT false,
  google_pay                BOOLEAN     DEFAULT false,
  cash_app_pay              BOOLEAN     DEFAULT false,
  created_at                TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_payment_methods_rider_id
  ON rider_payment_methods (rider_id);
