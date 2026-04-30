// Activation completeness checks. Each check is a single boolean fact about a
// payment-ready user that, if false, gives the admin a concrete thing to nudge.
// Keep the rules here so SMS templates and UI chips stay in lockstep.

export type ActivationCheckKey =
  // driver
  | 'driver_areas'
  | 'driver_display_name'
  | 'driver_handle'
  | 'driver_pricing'
  | 'driver_media'
  | 'driver_vehicle_info'
  | 'driver_visible'
  // rider
  | 'rider_display_name'
  | 'rider_avatar'
  | 'rider_recent_signin'
  | 'rider_has_activity';

export interface ActivationCheck {
  key: ActivationCheckKey;
  label: string;          // chip text shown in the UI
  passed: boolean;
  smsTemplate: string;    // {name} placeholder; rendered to ~140 chars
}

// ── Driver coverage breadth ───────────────────────────────────────────────
// "All over" drivers can serve the entire market. Otherwise, more areas =
// more match opportunities, so the admin can prioritize getting niche
// drivers to expand.
export type CoverageBucket = 'all_over' | 'wide' | 'solid' | 'niche' | 'none';

export function classifyCoverage(opts: {
  servicesEntireMarket: boolean;
  areaCount: number;
}): { bucket: CoverageBucket; label: string; areaCount: number } {
  if (opts.servicesEntireMarket) {
    return { bucket: 'all_over', label: 'ALL OVER', areaCount: opts.areaCount };
  }
  const n = opts.areaCount;
  if (n === 0) return { bucket: 'none', label: 'No areas', areaCount: n };
  if (n <= 2) return { bucket: 'niche', label: `${n} area${n === 1 ? '' : 's'} (Niche)`, areaCount: n };
  if (n <= 5) return { bucket: 'solid', label: `${n} areas (Solid)`, areaCount: n };
  return { bucket: 'wide', label: `${n} areas (Wide)`, areaCount: n };
}

// ── Driver checks ─────────────────────────────────────────────────────────
export interface DriverInput {
  display_name: string | null;
  handle: string | null;
  area_slugs: string[] | null;
  services_entire_market: boolean | null;
  pricing: Record<string, unknown> | null;
  thumbnail_url: string | null;
  video_url: string | null;
  vehicle_info: Record<string, unknown> | null;
  profile_visible: boolean | null;
}

export function computeDriverChecks(d: DriverInput): ActivationCheck[] {
  const hasAreas = (d.area_slugs?.length ?? 0) > 0 || d.services_entire_market === true;
  const pricingValues = Object.values(d.pricing ?? {});
  const hasPricing = pricingValues.some(v => typeof v === 'number' && v > 0);
  const vehicle = d.vehicle_info ?? {};
  const hasVehicle = !!(vehicle.make || vehicle.model || vehicle.license_plate || vehicle.plate);

  return [
    {
      key: 'driver_areas',
      label: 'Coverage areas',
      passed: hasAreas,
      smsTemplate: 'Yo {name} — add the areas you cover so riders find you in the feed: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_pricing',
      label: 'Pricing set',
      passed: hasPricing,
      smsTemplate: '{name}, riders pick drivers with prices set. Add yours so you stop getting skipped: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_media',
      label: 'Profile photo/video',
      passed: !!(d.thumbnail_url || d.video_url),
      smsTemplate: 'Riders book drivers they can SEE. 30 sec selfie video and you show up at the top: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_handle',
      label: '@handle',
      passed: !!d.handle,
      smsTemplate: '{name}, lock in your @handle so people can share your HMU page: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_display_name',
      label: 'Display name',
      passed: !!d.display_name,
      smsTemplate: 'Quick one — set your display name on HMU so riders know who they\'re booking: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_vehicle_info',
      label: 'Vehicle info',
      passed: hasVehicle,
      smsTemplate: '{name} — add your car (make/model + plate) so riders know what to look for: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_visible',
      label: 'Visible in feed',
      passed: d.profile_visible === true,
      smsTemplate: 'Heads up {name}: your profile is hidden from riders. Flip it visible so the bookings come in.',
    },
  ];
}

// ── Rider checks ──────────────────────────────────────────────────────────
export interface RiderInput {
  display_name: string | null;
  thumbnail_url: string | null;
  avatar_url: string | null;
  last_sign_in_at: Date | string | null;
  rides_completed_count: number;
  ride_requests_count: number;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function computeRiderChecks(r: RiderInput): ActivationCheck[] {
  const last = r.last_sign_in_at ? new Date(r.last_sign_in_at).getTime() : 0;
  const recentSignin = last > 0 && (Date.now() - last) < FOURTEEN_DAYS_MS;
  const hasActivity = r.rides_completed_count > 0 || r.ride_requests_count > 0;

  return [
    {
      key: 'rider_display_name',
      label: 'Display name',
      passed: !!r.display_name,
      smsTemplate: 'Quick one — add a display name on HMU so drivers know who they\'re picking up: atl.hmucashride.com/rider/profile',
    },
    {
      key: 'rider_avatar',
      label: 'Profile photo',
      passed: !!(r.thumbnail_url || r.avatar_url),
      smsTemplate: 'Drivers vibe-check rider profiles before accepting. Drop a photo so you don\'t get skipped: atl.hmucashride.com/rider/profile',
    },
    {
      key: 'rider_recent_signin',
      label: 'Active (14d)',
      passed: recentSignin,
      smsTemplate: '{name}, miss us? Cheap rides where you set the price. Open the app and post a ride: atl.hmucashride.com/rider',
    },
    {
      key: 'rider_has_activity',
      label: 'Booked or requested a ride',
      passed: hasActivity,
      smsTemplate: '{name}, you\'re payment-ready on HMU but haven\'t booked yet. Post a ride and let drivers come to you: atl.hmucashride.com/rider',
    },
  ];
}

// Score = passed / total, expressed 0-100.
export function completenessPercent(checks: ActivationCheck[]): number {
  if (!checks.length) return 0;
  const passed = checks.filter(c => c.passed).length;
  return Math.round((passed / checks.length) * 100);
}

// Render an SMS template with the user's first name. Falls back to "fam".
export function renderSms(template: string, displayName: string | null): string {
  const first = (displayName?.split(/\s+/)[0] || 'fam');
  return template.replace(/\{name\}/g, first);
}
