// Database Types
// TypeScript interfaces matching Neon database schema

// Enums
export type ProfileType = 'rider' | 'driver' | 'admin' | 'both';
export type AccountStatus = 'pending_activation' | 'active' | 'suspended' | 'banned';
export type Tier = 'free' | 'hmu_first';
export type PostType = 'rider_seeking_driver' | 'driver_offering_ride' | 'direct_booking';
export type HmuPostStatus = 'active' | 'matched' | 'expired' | 'cancelled';
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
  created_at: Date;
  updated_at: Date;
}

export interface DriverProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  gender?: string;
  pronouns?: string;
  lgbtq_friendly: boolean;
  video_url?: string;
  thumbnail_url?: string;
  areas: Record<string, any>; // JSONB
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

export interface RiderProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  gender?: string;
  pronouns?: string;
  lgbtq_friendly: boolean;
  video_url?: string;
  thumbnail_url?: string;
  safety_preferences: Record<string, any>; // JSONB
  price_range: string;
  stripe_customer_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface HmuPost {
  id: string;
  user_id: string;
  post_type: PostType;
  areas: string[]; // TEXT[]
  price: number;
  time_window: Record<string, any>; // JSONB
  status: HmuPostStatus;
  expires_at: Date;
  target_driver_id: string | null;
  booking_expires_at: Date | null;
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
export type AddOnStatus = 'pre_selected' | 'confirmed' | 'disputed' | 'adjusted' | 'removed';

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
