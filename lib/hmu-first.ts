// HMU First enrollment config — superadmin-controlled enable flag + price.
// Stored in platform_config under `hmu_first.config` (no migration needed; the
// key-value store already exists). When `enabled` is false, the driver app
// suppresses every HMU First upsell container and the upgrade route refuses to
// open a checkout. `priceCents` lets a superadmin set the monthly price shown in
// the app; the actual Stripe charge uses it too (see app/api/driver/upgrade).

import { getPlatformConfig } from '@/lib/platform-config/get';

export const HMU_FIRST_CONFIG_KEY = 'hmu_first.config';

export interface HmuFirstConfig {
  enabled: boolean;
  /** Monthly price in cents. Default 999 ($9.99). */
  priceCents: number;
}

// $9.99/mo is the historical default. Keep in sync with HMU_FIRST_PRICE_ID.
export const HMU_FIRST_DEFAULTS: HmuFirstConfig = { enabled: true, priceCents: 999 };

// Clamp range for the configurable price: $0.50–$100.00.
export const HMU_FIRST_MIN_CENTS = 50;
export const HMU_FIRST_MAX_CENTS = 10_000;

export async function getHmuFirstConfig(): Promise<HmuFirstConfig> {
  const cfg = await getPlatformConfig<Record<string, unknown>>(
    HMU_FIRST_CONFIG_KEY,
    { ...HMU_FIRST_DEFAULTS },
  );
  const rawPrice = Number(cfg.priceCents);
  const priceCents = Number.isFinite(rawPrice)
    ? Math.min(HMU_FIRST_MAX_CENTS, Math.max(HMU_FIRST_MIN_CENTS, Math.round(rawPrice)))
    : HMU_FIRST_DEFAULTS.priceCents;
  return { enabled: cfg.enabled !== false, priceCents };
}
