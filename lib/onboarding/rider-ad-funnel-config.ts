// Rider ad-funnel onboarding configuration. Backed by platform_config row
// 'onboarding.rider_ad_funnel'. Tunable via /admin/onboarding-config (rider tab).
//
// This is a SEPARATE flow from /onboarding ?type=rider (the standard rider
// onboarding for organic signups) and from express-rider-onboarding.tsx
// (the chat-funnel variant arriving via /d/{handle}). It's optimised for
// paid-ads conversion and is the destination for Meta/TikTok ad URLs.

import { getPlatformConfig } from '@/lib/platform-config/get';
import type { FieldVisibility } from '@/lib/onboarding/config';

export interface RiderAdFunnelFields {
  handle: FieldVisibility;
  media: FieldVisibility;        // photo OR video
  location: FieldVisibility;
  safetyChecks: FieldVisibility; // toggles user_preferences.safety_checks_enabled
}

export interface RiderAdFunnelConfig {
  enabled: boolean;
  fields: RiderAdFunnelFields;
  confirmationCta: string;       // text on the confirmation-page primary button
  browseRoute: string;           // where the CTA routes to (market browse page)
}

export const RIDER_AD_FUNNEL_DEFAULTS: RiderAdFunnelConfig = {
  enabled: true,
  fields: {
    handle: 'required',
    media: 'required',
    location: 'required',
    safetyChecks: 'optional',
  },
  confirmationCta: 'Browse Drivers',
  browseRoute: '/rider/browse',
};

export async function getRiderAdFunnelConfig(): Promise<RiderAdFunnelConfig> {
  return getPlatformConfig(
    'onboarding.rider_ad_funnel',
    RIDER_AD_FUNNEL_DEFAULTS as unknown as Record<string, unknown>,
  ) as unknown as Promise<RiderAdFunnelConfig>;
}
