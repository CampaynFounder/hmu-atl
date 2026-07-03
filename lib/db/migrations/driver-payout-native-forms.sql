-- Driver payout onboarding mode flag
-- OFF (default) = Option A: Stripe embedded Connect onboarding rendered in an
--                 in-app WebView (no external browser bounce). Works on the
--                 current Express Connect accounts.
-- ON            = Option B: fully native KYC forms on Custom accounts. Requires
--                 Stripe approval for Custom accounts + a compliance review
--                 before enabling. Flip back OFF to instantly revert to A.
-- Superadmin-toggleable at /admin/feature-flags. OFF = zero change.

INSERT INTO feature_flags (slug, name, description, enabled)
VALUES (
  'driver_payout_native_forms',
  'Driver Payout: Native Forms (Option B)',
  'OFF = embedded Stripe onboarding in an in-app WebView (Option A, default, Express accounts). ON = fully native KYC forms on Custom accounts (Option B) — only enable after Stripe approves Custom accounts + a compliance review. Toggle back OFF to revert to A instantly. No app rebuild to flip.',
  FALSE
)
ON CONFLICT (slug) DO NOTHING;
