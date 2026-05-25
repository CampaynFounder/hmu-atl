// Activation completeness checks. Each check is a single boolean fact about a
// payment-ready user that, if false, gives the admin a concrete thing to nudge.
// Keep the rules here so SMS templates and UI chips stay in lockstep.
//
// SMS body source of truth: the row in sms_templates with event_key matching
// `templateKey` — admin-editable at /admin/sms-templates. The `smsTemplate`
// literal kept on each check is a fallback used when the DB row is missing,
// disabled, or references an undefined variable. Callers SHOULD call
// renderTemplate(templateKey, variables) first and fall back to
// renderSms(smsTemplate, displayName) only when null.

import type { SmsEventKey } from '@/lib/sms/templates';

export type ActivationCheckKey =
  // driver — gap checks (red — fix this)
  | 'driver_areas'
  | 'driver_display_name'
  | 'driver_handle'
  | 'driver_pricing'
  | 'driver_media'
  | 'driver_vehicle_info'
  | 'driver_visible'
  | 'driver_payout_setup'
  | 'driver_deposit_floor'
  | 'driver_location_enabled'
  // driver — promo chips (green — opportunity to send)
  | 'driver_share_link_promo'
  | 'driver_profile_views_promo'
  // rider
  | 'rider_display_name'
  | 'rider_avatar'
  | 'rider_payment_method'
  | 'rider_recent_signin'
  | 'rider_has_activity';

// Chip tone — drives color in the UI and policy in the dashboard:
//   gap   → driver/rider is missing something they need; chip is red, click sends a fix-this nudge
//   promo → driver is fully payment-ready; chip is green, click sends a "go share / get more rides"
//           push. promo chips don't count toward completeness % (which only tracks gaps).
export type ActivationCheckTone = 'gap' | 'promo';

// Lifecycle stage — single canonical state per user, derived from DB columns.
// The classifier picks the EARLIEST stage the user hasn't cleared. UI uses this
// to filter the activation list and to route users to the right persona/SMS.
//
// signup            → phone verified, profile row not created yet (or empty)
// profile_incomplete → profile row exists but a required field is unset
// payment_setup     → profile complete, but driver has no Stripe Connect or rider has no PM
// ready_idle        → payment-ready but no rides/posts ever
// engaged           → has activity AND signed in within ENGAGED_WINDOW_DAYS
// dormant           → previously engaged but no sign-in within ENGAGED_WINDOW_DAYS
export type LifecycleStage =
  | 'signup'
  | 'profile_incomplete'
  | 'payment_setup'
  | 'ready_idle'
  | 'engaged'
  | 'dormant';

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  'signup', 'profile_incomplete', 'payment_setup', 'ready_idle', 'engaged', 'dormant',
];

const ENGAGED_WINDOW_DAYS = 14;

export interface ActivationCheck {
  key: ActivationCheckKey;
  label: string;          // chip text shown in the UI
  passed: boolean;
  tone: ActivationCheckTone;
  // Primary SMS body source: the sms_templates row with this event_key. Null
  // when the check has no associated transactional SMS (currently every check
  // has one, but the type allows for future "UI-only" chips).
  templateKey: SmsEventKey | null;
  // Variables map passed to renderTemplate. Names match {{placeholders}} in
  // the DB body. `name` is the recipient's first name; other keys (profileUrl,
  // viewCount) are baked at check-compute time.
  variables: Record<string, string | number>;
  // Fallback literal used when the DB row is missing/disabled/malformed. Uses
  // single-brace {name} placeholder (renderSms substitutes first name); other
  // values are interpolated at compute time. Keep in sync with the DB seed in
  // sql/sms-templates.sql.
  smsTemplate: string;
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
  stripe_onboarding_complete: boolean | null;
  deposit_floor: number | string | null;
  location_updated_at: Date | string | null;
  has_profile_row: boolean;
}

// Random integer in [min, max] inclusive — used to bake a synthetic
// "your profile got viewed N times" social-proof number into the SMS at
// compute time. The same number the admin previews is the one that ships.
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function computeDriverChecks(d: DriverInput): ActivationCheck[] {
  const hasAreas = (d.area_slugs?.length ?? 0) > 0 || d.services_entire_market === true;
  const pricingValues = Object.values(d.pricing ?? {});
  const hasPricing = pricingValues.some(v => typeof v === 'number' && v > 0);
  const vehicle = d.vehicle_info ?? {};
  const hasVehicle = !!(vehicle.make || vehicle.model || vehicle.license_plate || vehicle.plate);
  const hasDepositFloor = d.deposit_floor !== null && d.deposit_floor !== undefined;
  const locationEnabled = d.location_updated_at !== null && d.location_updated_at !== undefined;

  // Promo-chip prerequisites. Drivers must be PAYMENT-READY before the admin
  // can credibly tell them to share their link with the deposit guarantee
  // pitch — otherwise the promise is hollow.
  const paymentReady =
    hasPricing && d.stripe_onboarding_complete === true && hasDepositFloor;
  const handle = d.handle ?? '';
  const profileUrl = handle ? `atl.hmucashride.com/d/${handle}` : '';
  const name = firstNameOrFam(d.display_name);
  const viewCount = randInt(1, 5);

  return [
    {
      key: 'driver_payout_setup',
      label: 'Payout setup',
      tone: 'gap',
      passed: d.stripe_onboarding_complete === true,
      templateKey: 'driver_payout_setup',
      variables: { name },
      smsTemplate: '{name} — finish your payout setup so we can pay you out the second a ride caps. Takes 2 min: atl.hmucashride.com/driver/payout-setup',
    },
    {
      key: 'driver_deposit_floor',
      label: 'Deposit floor',
      tone: 'gap',
      passed: hasDepositFloor,
      templateKey: 'driver_deposit_floor',
      variables: { name },
      smsTemplate: '{name}, set your deposit floor in profile so riders can lock in rides at amounts you guarantee. 30s: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_location_enabled',
      label: 'Live location',
      tone: 'gap',
      passed: locationEnabled,
      templateKey: 'driver_location_enabled',
      variables: { name },
      smsTemplate: '{name}, turn on live location so riders see how close you are. They book what\'s nearest: atl.hmucashride.com/driver/home',
    },
    {
      key: 'driver_areas',
      label: 'Coverage areas',
      tone: 'gap',
      passed: hasAreas,
      templateKey: 'driver_areas',
      variables: { name },
      smsTemplate: 'Yo {name} — add the areas you cover so riders find you in the feed: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_pricing',
      label: 'Pricing set',
      tone: 'gap',
      passed: hasPricing,
      templateKey: 'driver_pricing',
      variables: { name },
      smsTemplate: '{name}, riders pick drivers with prices set. Add yours so you stop getting skipped: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_media',
      label: 'Profile photo/video',
      tone: 'gap',
      passed: !!(d.thumbnail_url || d.video_url),
      templateKey: 'driver_media',
      variables: {},
      smsTemplate: 'Riders book drivers they can SEE. 30 sec selfie video and you show up at the top: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_handle',
      label: '@handle',
      tone: 'gap',
      passed: !!d.handle,
      templateKey: 'driver_handle',
      variables: { name },
      smsTemplate: '{name}, lock in your @handle so people can share your HMU page: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_display_name',
      label: 'Display name',
      tone: 'gap',
      passed: !!d.display_name,
      templateKey: 'driver_display_name',
      variables: {},
      smsTemplate: 'Quick one — set your display name on HMU so riders know who they\'re booking: atl.hmucashride.com/driver/profile',
    },
    // Promo: payment-ready driver who has a public link → tell them to share
    // it with the 100% deposit-guarantee pitch. Chip appears (passed=false)
    // ONLY when prerequisites are met; otherwise hidden (passed=true).
    {
      key: 'driver_share_link_promo',
      label: 'Share HMU link',
      tone: 'promo',
      passed: !(paymentReady && handle),
      templateKey: 'driver_share_link_promo',
      variables: { name, profileUrl },
      smsTemplate: handle
        ? `Yo {name} — your link is ${profileUrl}. Every ride booked there is 100% deposit-guaranteed; collect the rest cash on pull up. Share it.`
        : '',
    },
    // Promo: synthetic "your profile got viewed N times" social proof. Random
    // generated once per compute call and passed in both as a variable (DB
    // template body) and baked into the literal fallback, so the admin
    // preview and the eventual send match when rendered from the same check.
    {
      key: 'driver_profile_views_promo',
      label: 'Profile views nudge',
      tone: 'promo',
      passed: !handle,
      templateKey: 'driver_profile_views_promo',
      variables: { name, viewCount, profileUrl },
      smsTemplate: handle
        ? `Yo {name} — your profile got viewed ${viewCount} times today. Share ${profileUrl} to lock those riders before they pick someone else.`
        : '',
    },
    {
      key: 'driver_vehicle_info',
      label: 'Vehicle info',
      tone: 'gap',
      passed: hasVehicle,
      templateKey: 'driver_vehicle_info',
      variables: { name },
      smsTemplate: '{name} — add your car (make/model + plate) so riders know what to look for: atl.hmucashride.com/driver/profile',
    },
    {
      key: 'driver_visible',
      label: 'Visible in feed',
      tone: 'gap',
      passed: d.profile_visible === true,
      templateKey: 'driver_visible',
      variables: { name },
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
  has_payment_method: boolean;
  has_profile_row: boolean;
}

const FOURTEEN_DAYS_MS = ENGAGED_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function computeRiderChecks(r: RiderInput): ActivationCheck[] {
  const last = r.last_sign_in_at ? new Date(r.last_sign_in_at).getTime() : 0;
  const recentSignin = last > 0 && (Date.now() - last) < FOURTEEN_DAYS_MS;
  const hasActivity = r.rides_completed_count > 0 || r.ride_requests_count > 0;
  const name = firstNameOrFam(r.display_name);

  return [
    {
      key: 'rider_payment_method',
      label: 'Payment method',
      tone: 'gap',
      passed: r.has_payment_method,
      templateKey: 'rider_payment_method',
      variables: { name },
      smsTemplate: '{name}, save a card so booking takes one tap. Small deposit locks the ride, rest is cash to driver: atl.hmucashride.com/rider/profile',
    },
    {
      key: 'rider_display_name',
      label: 'Display name',
      tone: 'gap',
      passed: !!r.display_name,
      templateKey: 'rider_display_name',
      variables: {},
      smsTemplate: 'Quick one — add a display name on HMU so drivers know who they\'re picking up: atl.hmucashride.com/rider/profile',
    },
    {
      key: 'rider_avatar',
      label: 'Profile photo',
      tone: 'gap',
      passed: !!(r.thumbnail_url || r.avatar_url),
      templateKey: 'rider_avatar',
      variables: {},
      smsTemplate: 'Drivers vibe-check rider profiles before accepting. Drop a photo so you don\'t get skipped: atl.hmucashride.com/rider/profile',
    },
    {
      key: 'rider_recent_signin',
      label: 'Active (14d)',
      tone: 'gap',
      passed: recentSignin,
      templateKey: 'rider_recent_signin',
      variables: { name },
      smsTemplate: '{name}, miss us? Cheap rides where you set the price. Open the app and post a ride: atl.hmucashride.com/rider',
    },
    {
      key: 'rider_has_activity',
      label: 'Booked or requested a ride',
      tone: 'gap',
      passed: hasActivity,
      templateKey: 'rider_has_activity',
      variables: { name },
      smsTemplate: '{name}, you\'re payment-ready on HMU but haven\'t booked yet. Post a ride and let drivers come to you: atl.hmucashride.com/rider',
    },
  ];
}

// Score = passed / total over GAP checks only. Promo chips are opportunities,
// not gaps — counting them would penalize a fully-ready driver for having a
// (not-yet-sent) "share your link" promo waiting.
export function completenessPercent(checks: ActivationCheck[]): number {
  const gaps = checks.filter(c => c.tone === 'gap');
  if (!gaps.length) return 0;
  const passed = gaps.filter(c => c.passed).length;
  return Math.round((passed / gaps.length) * 100);
}

// Strip a display name down to first name; fall back to "fam" when blank.
// Single source of truth for the {name} substitution — used by both renderSms
// (fallback literal path) and compute*Checks (variables map for the DB
// template path) so both render with the same name.
export function firstNameOrFam(displayName: string | null): string {
  return displayName?.split(/\s+/)[0] || 'fam';
}

// Render the literal-fallback smsTemplate with the user's first name. Used
// when renderTemplate() returned null (DB row missing/disabled/malformed).
export function renderSms(template: string, displayName: string | null): string {
  return template.replace(/\{name\}/g, firstNameOrFam(displayName));
}

// Classify a driver into one canonical lifecycle stage. Picks the EARLIEST
// stage the user hasn't cleared so the activation funnel reads top-down.
// "Profile complete" here means all driver checks pass EXCEPT payout setup,
// deposit floor, and visibility. payment_setup gates BOTH stripe onboarding
// AND a per-driver deposit floor — without the floor the deposit-only launch
// model can't credibly promise riders a guarantee, so the driver is not
// yet ready to take rides.
export function classifyDriverStage(input: {
  has_profile_row: boolean;
  display_name: string | null;
  handle: string | null;
  area_slugs: string[] | null;
  services_entire_market: boolean | null;
  pricing: Record<string, unknown> | null;
  thumbnail_url: string | null;
  video_url: string | null;
  vehicle_info: Record<string, unknown> | null;
  stripe_onboarding_complete: boolean | null;
  deposit_floor: number | string | null;
  last_sign_in_at: Date | string | null;
  has_posts: boolean;
}): LifecycleStage {
  if (!input.has_profile_row) return 'signup';

  const hasAreas = (input.area_slugs?.length ?? 0) > 0 || input.services_entire_market === true;
  const hasPricing = Object.values(input.pricing ?? {}).some(v => typeof v === 'number' && v > 0);
  const hasMedia = !!(input.thumbnail_url || input.video_url);
  const v = input.vehicle_info ?? {};
  const hasVehicle = !!(v.make || v.model || v.license_plate || v.plate);
  const profileComplete = !!input.display_name && !!input.handle && hasAreas && hasPricing && hasMedia && hasVehicle;
  if (!profileComplete) return 'profile_incomplete';

  const hasDepositFloor = input.deposit_floor !== null && input.deposit_floor !== undefined;
  if (input.stripe_onboarding_complete !== true || !hasDepositFloor) return 'payment_setup';

  if (!input.has_posts) return 'ready_idle';

  const lastMs = input.last_sign_in_at ? new Date(input.last_sign_in_at).getTime() : 0;
  const recent = lastMs > 0 && (Date.now() - lastMs) < FOURTEEN_DAYS_MS;
  return recent ? 'engaged' : 'dormant';
}

export function classifyRiderStage(input: {
  has_profile_row: boolean;
  display_name: string | null;
  thumbnail_url: string | null;
  avatar_url: string | null;
  has_payment_method: boolean;
  rides_completed_count: number;
  ride_requests_count: number;
  last_sign_in_at: Date | string | null;
}): LifecycleStage {
  if (!input.has_profile_row) return 'signup';

  const hasAvatar = !!(input.thumbnail_url || input.avatar_url);
  const profileComplete = !!input.display_name && hasAvatar;
  if (!profileComplete) return 'profile_incomplete';

  if (!input.has_payment_method) return 'payment_setup';

  const hasActivity = input.rides_completed_count > 0 || input.ride_requests_count > 0;
  if (!hasActivity) return 'ready_idle';

  const lastMs = input.last_sign_in_at ? new Date(input.last_sign_in_at).getTime() : 0;
  const recent = lastMs > 0 && (Date.now() - lastMs) < FOURTEEN_DAYS_MS;
  return recent ? 'engaged' : 'dormant';
}
