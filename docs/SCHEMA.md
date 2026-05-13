# SCHEMA — HMU ATL

> Source-of-truth schema for Neon Postgres + Clerk metadata. Schema Agent owns all migrations; no other agent edits the DB directly. Generated TypeScript types live at `/lib/db/types.ts`.
>
> Additional money-related tables (`daily_earnings`, `rider_payment_methods`, `price_negotiations`, `transaction_ledger`, `processed_webhook_events`, `ride_extensions`, plus extra `rides` columns) are documented in `docs/PAYMENTS.md`.

---

## NEON DATABASE SCHEMA

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  profile_type TEXT CHECK (profile_type IN ('rider', 'driver', 'admin')) NOT NULL,
  account_status TEXT CHECK (account_status IN ('pending', 'active', 'suspended')) DEFAULT 'pending',
  tier TEXT CHECK (tier IN ('free', 'hmu_first')) DEFAULT 'free',
  og_status BOOLEAN DEFAULT FALSE,
  chill_score NUMERIC(5,2) DEFAULT 0,
  completed_rides INTEGER DEFAULT 0,
  dispute_count INTEGER DEFAULT 0,
  stripe_customer_id TEXT,
  video_intro_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  areas TEXT[],
  heading_towards TEXT[],
  gender_identity TEXT,
  min_ride_amount NUMERIC(10,2),
  price_30min NUMERIC(10,2),
  price_1hr NUMERIC(10,2),
  price_2hr NUMERIC(10,2),
  price_out_of_town_per_hr NUMERIC(10,2),
  schedule_days TEXT[],
  notice_required TEXT,
  round_trip BOOLEAN DEFAULT FALSE,
  is_luxury BOOLEAN DEFAULT FALSE,
  stripe_account_id TEXT,
  vehicle_photo_url TEXT,
  license_plate TEXT,
  offers_grocery_pickup BOOLEAN DEFAULT FALSE,   -- post-MVP
  offers_product_pickup BOOLEAN DEFAULT FALSE,   -- post-MVP
  offers_barber_service BOOLEAN DEFAULT FALSE,   -- post-MVP
  offers_tattoo_service BOOLEAN DEFAULT FALSE,   -- post-MVP
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  price_range_min NUMERIC(10,2),
  price_range_max NUMERIC(10,2),
  driver_preference TEXT CHECK (driver_preference IN ('male', 'female', 'any')) DEFAULT 'any',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE hmu_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  post_type TEXT CHECK (post_type IN ('driver_available', 'rider_request')) NOT NULL,
  areas TEXT[] NOT NULL,
  price NUMERIC(10,2),
  time_window TEXT,
  max_stops INTEGER,
  status TEXT CHECK (status IN ('active', 'matched', 'expired', 'cancelled')) DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES users(id),
  rider_id UUID REFERENCES users(id),
  hmu_post_id UUID REFERENCES hmu_posts(id),
  status TEXT CHECK (status IN (
    'matched','otw','here','active','ended','disputed','completed','cancelled'
  )) DEFAULT 'matched',
  pickup_address TEXT,
  pickup_lat NUMERIC(10,8),
  pickup_lng NUMERIC(11,8),
  dropoff_address TEXT,
  dropoff_lat NUMERIC(10,8),
  dropoff_lng NUMERIC(11,8),
  stops JSONB,
  amount NUMERIC(10,2) NOT NULL,
  application_fee NUMERIC(10,2),
  payment_intent_id TEXT,
  driver_confirmed_end BOOLEAN DEFAULT FALSE,
  rider_confirmed_end BOOLEAN DEFAULT FALSE,
  driver_geo_at_end POINT,
  rider_geo_at_end POINT,
  dispute_window_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ride_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  lat NUMERIC(10,8) NOT NULL,
  lng NUMERIC(11,8) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ride_locations_ride_id ON ride_locations(ride_id);
CREATE INDEX idx_ride_locations_recorded_at ON ride_locations(recorded_at);

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id),
  filed_by UUID REFERENCES users(id),
  reason TEXT,
  status TEXT CHECK (status IN (
    'open','under_review','resolved_driver','resolved_rider','closed'
  )) DEFAULT 'open',
  ably_history_url TEXT,
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id),
  rater_id UUID REFERENCES users(id),
  rated_id UUID REFERENCES users(id),
  rating_type TEXT CHECK (rating_type IN ('chill','cool_af','kinda_creepy','weirdo')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ride_id, rater_id)
);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id),
  author_id UUID REFERENCES users(id),
  subject_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  sentiment_score NUMERIC(3,2),
  sentiment_flags TEXT[],
  is_visible BOOLEAN DEFAULT TRUE,
  flagged_for_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id),
  driver_id UUID REFERENCES users(id),
  gross_amount NUMERIC(10,2),
  platform_fee NUMERIC(10,2),
  net_amount NUMERIC(10,2),
  tier TEXT CHECK (tier IN ('free','hmu_first')),
  stripe_transfer_id TEXT,
  payout_timing TEXT CHECK (payout_timing IN ('instant','daily_batch')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB,
  channel TEXT CHECK (channel IN ('push','sms','in_app')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
```

---

## CLERK METADATA SCHEMA

```typescript
interface ClerkPublicMetadata {
  profileType: 'rider' | 'driver' | 'admin';
  accountStatus: 'pending' | 'active' | 'suspended';
  tier?: 'free' | 'hmu_first';        // drivers only
  ogStatus?: boolean;                 // riders only
  stripeAccountId?: string;           // drivers only
  stripeCustomerId?: string;
  videoIntroUrl?: string;
  completedRides: number;
  disputeCount: number;
  chillScore: number;
}
```

### Clerk Webhooks
| Event | Handler |
|---|---|
| `user.created` | Create Neon record + Stripe Customer + Stripe Connect (drivers) |
| `user.updated` | Sync to Neon |
| `user.deleted` | Soft delete Neon, cancel HMU First subscription |
| `session.created` | PostHog activation event |
