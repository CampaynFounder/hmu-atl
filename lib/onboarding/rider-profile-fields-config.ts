// Rider profile-fields configuration. Backed by platform_config row
// 'onboarding.rider_profile_fields'. Tunable via /admin/onboarding-config
// (rider profile-fields tab).
//
// Two surfaces gated here:
//   - rideTypes:  multi-select pills ("work", "errands", "kids", "turn up",
//                 "recurring", …). Admin-tunable list — add/edit/disable
//                 without a deploy.
//   - homeArea:   single-select picker over `market_areas` for the rider's
//                 home neighborhood (West End, Buckhead, etc.). Reuses the
//                 same chips the driver areas step uses.
//
// Visibility values mirror DriverExpressFields:
//   required | optional | hidden | deferred
//
// Consumed by all three rider onboarding flows:
//   - rider-onboarding.tsx        (organic /onboarding ?type=rider)
//   - rider-ad-funnel-onboarding.tsx (paid-ads /r/express)
//   - express-rider-onboarding.tsx (chat funnel /d/{handle}) — optional
//
// One config covers all three; the per-flow component decides where to
// slot the steps. That keeps one editor in the admin instead of 3.

import { getPlatformConfig } from '@/lib/platform-config/get';
import type { FieldVisibility } from '@/lib/onboarding/config';

export interface RideTypeOption {
  slug: string;     // stable id; written to rider_profiles.ride_types
  label: string;    // user-facing text on the pill
  emoji?: string;   // optional emoji prefix
  enabled: boolean; // false = hidden from picker but kept for analytics back-compat
}

export interface RiderProfileFields {
  rideTypes: FieldVisibility;
  homeArea: FieldVisibility;
}

export interface RiderProfileFieldsConfig {
  fields: RiderProfileFields;
  rideTypeOptions: RideTypeOption[];
  // Caps. Keep these honest — array/text columns will silently accept whatever
  // we send, so the validators on the admin route enforce these.
  maxRideTypeSelections: number;
}

export const RIDER_PROFILE_FIELDS_DEFAULTS: RiderProfileFieldsConfig = {
  fields: {
    // Default off everywhere so existing flows are unchanged until admin
    // flips the switch and tests in /admin/flows.
    rideTypes: 'hidden',
    homeArea: 'hidden',
  },
  rideTypeOptions: [
    { slug: 'work',      label: 'Work',      emoji: '💼', enabled: true },
    { slug: 'errands',   label: 'Errands',   emoji: '🛍️', enabled: true },
    { slug: 'kids',      label: 'Kids',      emoji: '🧒', enabled: true },
    { slug: 'turn_up',   label: 'Turn up',   emoji: '🎉', enabled: true },
    { slug: 'recurring', label: 'Recurring', emoji: '🔁', enabled: true },
  ],
  maxRideTypeSelections: 5,
};

export async function getRiderProfileFieldsConfig(): Promise<RiderProfileFieldsConfig> {
  const merged = (await getPlatformConfig(
    'onboarding.rider_profile_fields',
    RIDER_PROFILE_FIELDS_DEFAULTS as unknown as Record<string, unknown>,
  )) as unknown as RiderProfileFieldsConfig;
  // getPlatformConfig is shallow — re-merge `fields` so adding a new key to
  // RiderProfileFields stays backwards-compatible with stored rows.
  return {
    ...merged,
    fields: { ...RIDER_PROFILE_FIELDS_DEFAULTS.fields, ...(merged.fields ?? {}) },
    rideTypeOptions: Array.isArray(merged.rideTypeOptions) && merged.rideTypeOptions.length
      ? merged.rideTypeOptions
      : RIDER_PROFILE_FIELDS_DEFAULTS.rideTypeOptions,
    maxRideTypeSelections: merged.maxRideTypeSelections ?? RIDER_PROFILE_FIELDS_DEFAULTS.maxRideTypeSelections,
  };
}

// Filter to the options we'd actually show a rider — honor `enabled` flag.
export function visibleRideTypes(config: RiderProfileFieldsConfig): RideTypeOption[] {
  return config.rideTypeOptions.filter(o => o.enabled);
}
