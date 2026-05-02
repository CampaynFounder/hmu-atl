// Database Types
// TypeScript interfaces matching Neon database schema

// Enums
export type ProfileType = 'rider' | 'driver' | 'admin';
export type AccountStatus = 'pending_activation' | 'active' | 'suspended' | 'banned';
export type Tier = 'free' | 'hmu_first';
export type PostType = 'rider_seeking_driver' | 'driver_offering_ride' | 'direct_booking';
export type HmuPostStatus = 'active' | 'matched' | 'expired' | 'cancelled' | 'completed' | 'declined_awaiting_rider';
export type RideStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'closed';
export type RatingType = 'chill' | 'cool_af' | 'kinda_creepy' | 'weirdo';
export type NotificationType = 'ride_request' | 'ride_accepted' | 'ride_started' | 'ride_completed' | 'payment_received' | 'dispute_filed' | 'rating_received';
export type TimingTier = 'free' | 'hmu_first';

// Tables
export interface User {
  id: string;
  clerk_id: string;
  profile_type: ProfileType;
  account_status: AccountStatus;
  tier: Tier;
  og_status: boolean;
  chill_score: number;
  completed_rides: number;
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

// Admin-only attribution fields — not returned by default getUserByClerkId/getUserById.
// Use getUserAttribution() for admin routes and webhook handlers.
export interface UserAttribution {
  signup_source: 'hmu_chat' | 'direct' | 'homepage_lead' | null;
  referred_by_driver_id: string | null;
  referred_via_hmu_post_id: string | null;
  admin_last_seen_at: Date | null;
}

export interface DriverProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  phone?: string;
  gender?: string;
  pronouns?: string;
  lgbtq_friendly: boolean;
  video_url?: string;
  thumbnail_url?: string;
  areas: Record<string, any>; // JSONB — LEGACY, read-only, superseded by area_slugs
  area_slugs: string[];
  services_entire_market: boolean;
  accepts_long_distance: boolean;
  pricing: Record<string, any>; // JSONB
  schedule: Record<string, any>; // JSONB
  vehicle_info: Record<string, any>; // JSONB
  stripe_connect_id?: string;
  handle: string | null;
  accept_direct_bookings: boolean;
  min_rider_chill_score: number;
  require_og_status: boolean;
  created_at: Date;
  updated_at: Date;
}

export type Cardinal = 'westside' | 'eastside' | 'northside' | 'southside' | 'central';

export interface MarketArea {
  id: string;
  market_id: string;
  slug: string;
  name: string;
  cardinal: Cardinal;
  sort_order: number;
  is_active: boolean;
}

export interface RiderProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  handle?: string | null;
  phone?: string;
  gender?: string;
  pronouns?: string;
  lgbtq_friendly: boolean;
  video_url?: string;
  thumbnail_url?: string;
  safety_preferences: Record<string, any>; // JSONB
  price_range: string;
  stripe_customer_id?: string;
  ride_types?: string[] | null;
  home_area_slug?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ProfileView {
  rider_id: string;
  driver_id: string;
  view_count: number;
  first_viewed_at: Date;
  last_viewed_at: Date;
}

export interface HmuPost {
  id: string;
  user_id: string;
  market_id: string;
  post_type: PostType;
  areas: string[]; // TEXT[] — legacy freeform, superseded by pickup_area_slug/dropoff_area_slug
  pickup_area_slug: string | null;
  dropoff_area_slug: string | null;
  dropoff_in_market: boolean;
  last_declined_by: string | null;
  price: number;
  time_window: Record<string, any>; // JSONB
  status: HmuPostStatus;
  expires_at: Date;
  target_driver_id: string | null;
  booking_expires_at: Date | null;
  is_cash: boolean;
  created_at: Date;
}

export interface Ride {
  id: string;
  rider_id: string;
  driver_id: string;
  pickup: Record<string, any>; // JSONB
  dropoff: Record<string, any>; // JSONB
  stops: Record<string, any>; // JSONB
  price: number;
  payment_intent_id: string;
  application_fee: number;
  status: RideStatus;
  dispute_window_expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RideLocation {
  id: string;
  ride_id: string;
  lat: number;
  lng: number;
  recorded_at: Date;
}

export interface Dispute {
  id: string;
  ride_id: string;
  filed_by: string;
  details: string;
  ably_history_url: string;
  status: DisputeStatus;
  created_at: Date;
  updated_at: Date;
}

export interface Rating {
  id: string;
  ride_id: string;
  rated_id: string;
  rated_by: string;
  rating_type: RatingType;
  created_at: Date;
}

export interface Comment {
  id: string;
  ride_id: string;
  commenter_id: string;
  comment_text: string;
  sentiment_score: number;
  is_visible: boolean;
  created_at: Date;
}

export interface Payout {
  id: string;
  driver_id: string;
  amount: number;
  timing_tier: TimingTier;
  stripe_transfer_id: string;
  created_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: Record<string, any>; // JSONB
  read: boolean;
  created_at: Date;
}

export type EnrollmentOfferStatus = 'active' | 'exhausted' | 'expired';

export interface DriverEnrollmentOffer {
  id: string;
  name: string;
  free_rides: number;
  free_earnings_cap: number;
  free_days: number;
  headline: string;
  fine_print: string;
  is_active: boolean;
  created_at: Date;
}

export interface DriverOfferEnrollment {
  id: string;
  driver_id: string;
  offer_id: string;
  free_rides: number;
  free_earnings_cap: number;
  free_days: number;
  enrolled_at: Date;
  rides_used: number;
  earnings_used: number;
  total_waived_fees: number;
  status: EnrollmentOfferStatus;
  exhausted_at: Date | null;
  exhausted_reason: string | null;
}

// Service Menu
export type PricingType = 'flat' | 'per_unit' | 'per_minute';
export type ServiceCategory = 'ride' | 'vibe' | 'vehicle' | 'errand' | 'custom';
export type AddOnStatus = 'pending_driver' | 'confirmed' | 'removal_pending' | 'removed' | 'rejected' | 'disputed' | 'adjusted';

// Validated address from Mapbox Search Box
export interface ValidatedAddress {
  address: string;
  name: string;
  latitude: number;
  longitude: number;
  mapbox_id: string;
}

export interface ValidatedStop extends ValidatedAddress {
  order: number;
  reached_at: string | null;
  verified: boolean;
}

export interface ServiceMenuItem {
  id: string;
  name: string;
  default_price: number;
  pricing_type: PricingType;
  unit_label: string | null;
  category: ServiceCategory;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface DriverServiceMenuItem {
  id: string;
  driver_id: string;
  item_id: string | null;
  custom_name: string | null;
  custom_icon: string | null;
  price: number;
  pricing_type: PricingType;
  unit_label: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  // Resolved from join with service_menu_items
  name?: string;
  icon?: string;
  category?: ServiceCategory;
}

export interface RideAddOn {
  id: string;
  ride_id: string;
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  added_by: 'rider' | 'system';
  status: AddOnStatus;
  rider_adjusted_amount: number | null;
  dispute_reason: string | null;
  final_amount: number | null;
  added_at: Date;
  confirmed_at: Date | null;
}

// ============================================================================
// Pricing & Promotions (Phase 1 — schema)
// ============================================================================

export type PromoType = 'free_rides' | 'percent_off_fees' | 'free_hmu_first';

export type PromoEligibility =
  | 'new_drivers'
  | 'all_drivers'
  | 'specific_drivers'
  | 'funnel_stage';

export type CouponSource = 'auto_signup' | 'code_redemption' | 'manual_assignment';

export type CouponStatus = 'active' | 'exhausted' | 'expired' | 'revoked';

export interface PublicOffer {
  id: string;
  market_id: string | null;
  tier: Tier;
  funnel_stage_slug: string | null;
  before_price_cents: number;
  after_price_cents: number;
  label_text: string | null;
  linked_promotion_id: string | null;
  effective_from: Date;
  effective_to: Date | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export type FreeRidesBenefit = { rides: number };
export type PercentOffBenefit = { percent: number; days?: number; rides?: number };
export type FreeHmuFirstBenefit = { months: number };
export type PromoBenefitConfig = FreeRidesBenefit | PercentOffBenefit | FreeHmuFirstBenefit | Record<string, never>;

export type PromoEligibilityConfig =
  | { funnel_stage_slug: string }
  | Record<string, never>;

export interface Promotion {
  id: string;
  market_id: string | null;
  name: string;
  description: string | null;
  code: string | null;
  promo_type: PromoType;
  benefit_config: PromoBenefitConfig;
  eligibility: PromoEligibility;
  eligibility_config: PromoEligibilityConfig;
  global_redemption_cap: number | null;
  global_redemptions_used: number;
  auto_apply_on_signup: boolean;
  starts_at: Date;
  ends_at: Date | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DriverCoupon {
  id: string;
  driver_id: string;
  promotion_id: string;
  source: CouponSource;
  uses_remaining: number | null;
  original_uses: number | null;
  status: CouponStatus;
  issued_at: Date;
  expires_at: Date | null;
  exhausted_at: Date | null;
  revoked_at: Date | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

export interface CouponRedemption {
  id: string;
  driver_coupon_id: string;
  ride_id: string;
  fee_waived_cents: number;
  fee_would_have_been_cents: number;
  fee_charged_cents: number;
  created_at: Date;
}

export interface SignupPricingSnapshot {
  id: string;
  user_id: string;
  market_id: string | null;
  funnel_stage: string | null;
  pricing_config_free_id: string | null;
  pricing_config_hmu_first_id: string | null;
  public_offer_id: string | null;
  auto_applied_promotion_id: string | null;
  auto_applied_coupon_id: string | null;
  captured_at: Date;
}

// ============================================================================
// Ride Safety Checks — periodic in-ride check-ins + anomaly/distress events
// ============================================================================

export type SafetyParty = 'rider' | 'driver' | 'system';

export type SafetyCheckParty = Exclude<SafetyParty, 'system'>;

export type SafetyCheckTrigger = 'scheduled' | 'anomaly_followup' | 'manual_admin';

export type SafetyCheckResponse = 'ok' | 'alert' | 'ignored';

export type SafetyEventType =
  | 'off_route'
  | 'stopped_too_long'
  | 'gps_silence'
  | 'wrong_direction'
  | 'speed_extreme'
  | 'check_in_alert'
  | 'distress_admin'
  | 'distress_911'
  | 'distress_contact'
  | 'ignored_streak';

export type SafetyEventSeverity = 'info' | 'warn' | 'high' | 'critical';

export interface RideSafetyCheck {
  id: string;
  ride_id: string;
  user_id: string;
  party: SafetyCheckParty;
  trigger: SafetyCheckTrigger;
  sent_at: Date;
  responded_at: Date | null;
  response: SafetyCheckResponse | null;
  location_lat: number | null;
  location_lng: number | null;
  related_event_id: string | null;
  created_at: Date;
}

export interface RideSafetyEvent {
  id: string;
  ride_id: string;
  event_type: SafetyEventType;
  severity: SafetyEventSeverity;
  party: SafetyParty;
  triggered_by_user_id: string | null;
  detected_at: Date;
  evidence: Record<string, unknown>;
  location_lat: number | null;
  location_lng: number | null;
  admin_resolved_at: Date | null;
  admin_resolved_by: string | null;
  admin_notes: string | null;
  created_at: Date;
}

// User-facing safety prefs (read from user_preferences, merged with platform defaults).
// interval_minutes null on the DB row means "use platform default"; the resolved
// value is always a number when returned to clients.
export interface SafetyPrefs {
  enabled: boolean;
  interval_minutes: number;
  interval_is_default: boolean;
  min_interval_minutes: number;
  max_interval_minutes: number;
}

export interface PlatformSafetyConfig {
  enabled: boolean;
  default_interval_minutes_rider: number;
  default_interval_minutes_driver: number;
  min_interval_minutes: number;
  max_interval_minutes: number;
  first_check_delay_minutes: number;
  prompt_auto_dismiss_seconds: number;
  ignored_streak_threshold: number;
  anomaly: {
    off_route_distance_meters: number;
    off_route_duration_seconds: number;
    stopped_duration_seconds: number;
    stopped_radius_meters: number;
    gps_silence_seconds: number;
    wrong_direction_duration_seconds: number;
    speed_max_mph: number;
  };
}
