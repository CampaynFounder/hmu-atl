-- Adds the platform-level Instant Payouts kill switch to the existing
-- platform_config table. Stripe starts new Connect platforms with a
-- $0.00 daily Instant volume cap until they manually approve an
-- increase. Until that approval lands, this flag stays false and the
-- driver CashoutCard shows the trust-building message instead of
-- letting drivers hit a confusing Stripe rejection.
--
-- Applied: 2026-04-21 to production branch (still-rain-53751745).
-- Do not re-apply on the production branch.

INSERT INTO platform_config (config_key, config_value, updated_by)
VALUES ('instant_payouts_enabled', '{"enabled": false}'::jsonb, 'claude-batch1-seed')
ON CONFLICT (config_key) DO NOTHING;

-- Flip to enable once Stripe approves the platform's Instant Payouts limit:
-- UPDATE platform_config SET config_value = '{"enabled": true}'::jsonb,
--   updated_at = NOW(), updated_by = 'admin-stripe-approval' WHERE config_key = 'instant_payouts_enabled';
