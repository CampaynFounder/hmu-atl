// Driver payout onboarding mode — superadmin-selectable at /admin/payout-mode so
// each approach can be A/B-tested on-device WITHOUT an app rebuild (the mobile
// app reads the resolved mode off /driver/payout-setup).
//
//   'browser'  — in-app Safari sheet (ASWebAuthenticationSession) over Stripe's
//                hosted onboarding. Reliable everywhere (shares Safari cookies);
//                a system sheet, not a full external-browser switch. DEFAULT.
//   'embedded' — Stripe embedded ConnectJS in an in-app WebView. Fully themed,
//                but known-flaky on iOS (WKWebView blocks the cross-origin
//                cookies/storage ConnectJS needs) → keep for testing only.
//   'native'   — fully native KYC forms on a Custom account. Best UX, but only
//                works for drivers with NO existing account, and needs Stripe
//                Custom-account approval before it can actually enable payouts.
//
// Persisted in platform_config key `driver.payout_mode`; no migration needed
// (missing row falls through to the default).

import { getPlatformConfig } from '@/lib/platform-config/get';

export const PAYOUT_MODE_KEY = 'driver.payout_mode';

export type PayoutMode = 'browser' | 'embedded' | 'native';
export const PAYOUT_MODES: PayoutMode[] = ['browser', 'embedded', 'native'];

export interface PayoutModeConfig {
  mode: PayoutMode;
}

export const DEFAULT_PAYOUT_MODE_CONFIG: PayoutModeConfig = { mode: 'browser' };

export function isPayoutMode(v: unknown): v is PayoutMode {
  return typeof v === 'string' && (PAYOUT_MODES as string[]).includes(v);
}

export async function getPayoutModeConfig(): Promise<PayoutModeConfig> {
  const cfg = (await getPlatformConfig(
    PAYOUT_MODE_KEY,
    DEFAULT_PAYOUT_MODE_CONFIG as unknown as Record<string, unknown>,
  )) as unknown as PayoutModeConfig;
  return { mode: isPayoutMode(cfg.mode) ? cfg.mode : 'browser' };
}

export async function getPayoutMode(): Promise<PayoutMode> {
  return (await getPayoutModeConfig()).mode;
}
