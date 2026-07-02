-- Rider Apple Pay button feature flag
-- Gates a dedicated, always-visible native Apple Pay button (PlatformPayButton)
-- on the rider payment-setup screen. Apple App Review (Guideline 2.1.0) reported
-- they could not locate the Apple Pay integration because it only appears inside
-- the Stripe payment sheet modal. This flag surfaces an unmistakable Apple Pay
-- button up front. Superadmin-toggleable at /admin/feature-flags — flip OFF after
-- approval to revert to sheet-only, no app rebuild.
-- OFF by default = zero change (current sheet-only behavior).

INSERT INTO feature_flags (slug, name, description, enabled)
VALUES (
  'rider_apple_pay_button',
  'Rider Apple Pay Button',
  'Renders a dedicated native Apple Pay button on the rider Add Payment Method screen (in addition to the Stripe payment sheet, which also offers Apple Pay). Added so App Store review can locate the Apple Pay integration. OFF = sheet-only (current behavior). Toggle live — no app rebuild.',
  FALSE
)
ON CONFLICT (slug) DO NOTHING;
