// Driver-onboarding configuration. Backed by platform_config row
// 'onboarding.driver_express'. Tuned via /admin/onboarding-config.
//
// Field-visibility values:
//   - required: visible step, must complete before continuing
//   - optional: visible step, can skip
//   - hidden:   not in flow, not in Pre-Ride To-Do
//   - deferred: not in flow, but surfaced as a Pre-Ride To-Do item

import { getPlatformConfig } from '@/lib/platform-config/get';

export type FieldVisibility = 'required' | 'optional' | 'hidden' | 'deferred';

export interface PricingTier {
  label: string;
  min: number;
  rate30: number;
  rate1h: number;
  rate2h: number;
  default?: boolean;
}

export interface DriverExpressFields {
  govName: FieldVisibility;
  licensePlate: FieldVisibility;
  vehicleMakeModel: FieldVisibility;
  vehicleYear: FieldVisibility;
  seatMap: FieldVisibility;
  videoIntro: FieldVisibility;
  adPhoto: FieldVisibility;
  riderPreferences: FieldVisibility;
  location: FieldVisibility;
  areas: FieldVisibility;
}

export interface DriverExpressScheduleDefault {
  days: string[];
  start: string;
  end: string;
  noticeRequired: string;
}

export interface DriverExpressConfig {
  enabled: boolean;
  fields: DriverExpressFields;
  pricingTiers: PricingTier[];
  stopsFee: number;
  waitPerMin: number;
  scheduleDefault: DriverExpressScheduleDefault;
}

export const DRIVER_EXPRESS_DEFAULTS: DriverExpressConfig = {
  enabled: true,
  fields: {
    govName: 'deferred',
    licensePlate: 'deferred',
    vehicleMakeModel: 'required',
    vehicleYear: 'optional',
    seatMap: 'required',
    videoIntro: 'deferred',
    adPhoto: 'deferred',
    riderPreferences: 'deferred',
    location: 'deferred',
    // Default off: existing express drivers (and any market without an
    // explicit areas roster yet) keep the legacy "anywhere" behaviour. Admin
    // flips this to 'optional' or 'required' to surface the picker.
    areas: 'hidden',
  },
  pricingTiers: [
    { label: '$10', min: 10, rate30: 15, rate1h: 25, rate2h: 45 },
    { label: '$25', min: 25, rate30: 25, rate1h: 40, rate2h: 70, default: true },
    { label: '$50', min: 50, rate30: 50, rate1h: 75, rate2h: 125 },
  ],
  stopsFee: 5,
  waitPerMin: 1,
  scheduleDefault: {
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    start: '07:00',
    end: '22:00',
    noticeRequired: '30min',
  },
};

export async function getDriverExpressConfig(): Promise<DriverExpressConfig> {
  // getPlatformConfig is generic over Record<string, unknown>; we cast through
  // unknown because our typed config has a fixed-shape interface, not an index
  // signature.
  const merged = (await getPlatformConfig(
    'onboarding.driver_express',
    DRIVER_EXPRESS_DEFAULTS as unknown as Record<string, unknown>,
  )) as unknown as DriverExpressConfig;
  // getPlatformConfig is a *shallow* merge — without this, a stored config that
  // predates a new field key (e.g. `areas`) would silently drop it because
  // stored.fields replaces DEFAULTS.fields wholesale. Re-merge `fields` so
  // adding a field to DriverExpressFields stays backwards-compatible with
  // every existing platform_config row.
  return {
    ...merged,
    fields: { ...DRIVER_EXPRESS_DEFAULTS.fields, ...(merged.fields ?? {}) },
  };
}

export function pickDefaultTier(tiers: PricingTier[]): PricingTier {
  return tiers.find(t => t.default) ?? tiers[Math.floor(tiers.length / 2)] ?? tiers[0];
}

// Returns the canonical pricing-JSONB shape that the rest of the app reads:
// driver profile UI, rider HMU share, booking endpoint, chat-booking, pending
// actions. Keep these key names in sync with `app/driver/profile/driver-profile-client.tsx`
// pricing inputs and `app/api/drivers/[handle]/book/route.ts` enforcement.
export function pricingFromTier(tier: PricingTier, stopsFee: number) {
  return {
    minimum: tier.min,
    base_rate: tier.rate30,
    hourly: tier.rate1h,
    two_hour: tier.rate2h,
    out_of_town: tier.rate1h + 10,
    round_trip: false,
    stops_fee: stopsFee,
  };
}

const DAY_CODE_TO_NAME: Record<string, string> = {
  mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
  fri: 'friday', sat: 'saturday', sun: 'sunday',
};

// Returns the canonical schedule-JSONB shape: per-day { available } objects
// keyed by full day name, matching what the driver profile + rider HMU pages
// read. The express config's short codes ('mon') and start/end/notice fields
// are not consumed by any UI; they're flattened here.
export function scheduleFromDefault(def: DriverExpressScheduleDefault): Record<string, { available: boolean }> {
  const out: Record<string, { available: boolean }> = {};
  for (const code of def.days) {
    const name = DAY_CODE_TO_NAME[code];
    if (name) out[name] = { available: true };
  }
  return out;
}

// Express config stores notice_required as a human string like '30min' or '1hr'.
// The driver_profiles.advance_notice_hours column is INTEGER, so we round up
// to the next whole hour — '30min' → 1, '15min' → 1, '2hr' → 2. Rounding up
// matches advance-notice semantics (driver wants at least N hours heads-up).
// Returns 0 only when the input is missing/zero/unparseable.
export function noticeHoursFromString(notice: string): number {
  const m = String(notice || '').trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(min|hr|h|hour|hours)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n <= 0) return 0;
  const unit = m[2] || 'min';
  const hours = unit.startsWith('h') ? n : n / 60;
  return Math.ceil(hours);
}
