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
  return getPlatformConfig(
    'onboarding.driver_express',
    DRIVER_EXPRESS_DEFAULTS as unknown as Record<string, unknown>,
  ) as unknown as Promise<DriverExpressConfig>;
}

export function pickDefaultTier(tiers: PricingTier[]): PricingTier {
  return tiers.find(t => t.default) ?? tiers[Math.floor(tiers.length / 2)] ?? tiers[0];
}

export function pricingFromTier(tier: PricingTier, stopsFee: number) {
  return {
    min_ride: tier.min,
    rate_30min: tier.rate30,
    rate_1hr: tier.rate1h,
    rate_2hr: tier.rate2h,
    rate_out_of_town_per_hr: tier.rate1h + 10,
    round_trip: false,
    stops_fee: stopsFee,
  };
}
