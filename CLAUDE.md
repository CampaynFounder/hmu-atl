# HMU ATL — CLAUDE.md
> Single source of truth for all agents. Every Claude Code session reads this file automatically.
> Each agent subdirectory appends its own SCOPE section below this shared content.

---

## WHAT THIS APP IS

HMU ATL is a **mobile-first PWA** peer-to-peer ride platform for Metro Atlanta.
- **Riders**: Young Atlantans who can't afford Uber/Lyft
- **Drivers**: Local Atlantans earning on their own schedule
- **Language**: Urban Atlanta — HMU, BET, OTW, CHILL, Cool AF, WEIRDO
- **MVP Scope**: Ride flow only. Service bookings and Pickup/Delivery are post-MVP.

---

## TECH STACK (LOCKED — DO NOT SUBSTITUTE)

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) — PWA |
| Styling | Tailwind CSS + Shadcn/UI |
| UI Components | 21st.dev registry (shadcn-based) via `npx shadcn` |
| Auth | Clerk |
| Database | Neon (Serverless Postgres) |
| Realtime | Ably |
| Payments | Stripe Connect |
| Maps | Mapbox GL JS + Turf.js |
| Hosting | Cloudflare Pages + Workers |
| SMS | Twilio (Verify + SMS) |
| AI/NLP | OpenAI GPT-4o-mini |
| Rate Limiting | Upstash Redis |
| Analytics | PostHog |
| Error Tracking | Sentry |

---

## DEPLOYMENT (CRITICAL — READ BEFORE ANY DEPLOY)

> **Production is served by the `hmu-atl` Cloudflare Worker, NOT Cloudflare Pages.**
> The custom domains `atl.hmucashride.com` and `nola.hmucashride.com` route to this worker (plus `hmucashride.com/*`).
> Deploying to the wrong target causes **Clerk handshake errors** because Clerk is configured for `atl.hmucashride.com` only.

### Deploys are MANUAL — `git push` does nothing on its own
There is no CI/CD auto-deploy. Pushing to `origin/main` does not ship code to prod. You must run the deploy command yourself after pushing (or before — the worker build is independent of the remote).

### How to deploy to production
```bash
npm run build && npx opennextjs-cloudflare build && npx wrangler deploy --config wrangler.worker.jsonc
```
Or the npm shortcut (skips the bare `next build` since OpenNext does it):
```bash
npm run deploy:worker
```

### What each piece does
| Step | Command | Purpose |
|---|---|---|
| 1 | `npm run build` | Next.js production build |
| 2 | `npx opennextjs-cloudflare build` | Converts Next.js output to Cloudflare Worker format (`.open-next/worker.js`) |
| 3 | `npx wrangler deploy --config wrangler.worker.jsonc` | Deploys to `hmu-atl` worker → `atl.hmucashride.com` |

### How to verify a deploy shipped
```bash
npx wrangler deployments list --name hmu-atl | head -20
```
Compare the top timestamp to your deploy time. If it's older than your last run, your deploy didn't land.

### DO NOT
- **DO NOT** use `wrangler pages deploy` — that deploys to Pages, not the Worker
- **DO NOT** deploy without `--config wrangler.worker.jsonc` — the default `wrangler.jsonc` is for Pages
- **DO NOT** omit the custom domain route from `wrangler.worker.jsonc`
- **DO NOT** assume `git push` deploys anything — it only updates GitHub

### Clerk domain configuration
- Clerk publishable key is bound to `clerk.atl.hmucashride.com`
- `NEXT_PUBLIC_CLERK_DOMAIN=clerk.atl.hmucashride.com` must be set as a Worker secret
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must be set as a Worker secret
- If the site is accessed on any other domain (e.g. `*.workers.dev`), Clerk handshake will fail

---

## CLOUDFLARE IMAGES (in-Worker pattern)

Image Transformations are enabled on the `hmucashride.com` zone with the R2 pub origin (`pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev`) on the Sources allowlist. Billed at $5/mo per 100k transforms; results cached at the edge.

### When you need it
- Server-rendered images (next/og share cards) where Satori must receive EXIF-rotated, resized JPEG bytes — Satori reads raw pixels and ignores EXIF, so iPhone portrait photos render sideways without a transform
- Anywhere user-uploaded R2 photos need uniform crops, format negotiation, or quality control

### How to invoke from a Worker / route handler
```ts
const resp = await fetch(sourceUrl, {
  cf: { image: { width: 800, format: 'jpeg', quality: 85 } },
} as RequestInit);
// resp.body is the transformed image
```

### DO NOT use the URL form from inside a Worker
```ts
// ❌ Returns 404 — same-zone subrequests bypass the /cdn-cgi/image interposer
const resp = await fetch(`${origin}/cdn-cgi/image/width=800/${sourceUrl}`);
```
The URL form (`/cdn-cgi/image/<options>/<source>`) is for **external clients** (browsers, OG validators, social crawlers) — those go through CF's edge transformer. Worker outbound subrequests don't, so the path 404s back to the Worker. This bug is invisible from outside (curl from your laptop returns 200), so always verify the actual fetch result inside the Worker.

### For next/og (Satori) specifically
Satori's own `<img>` fetch is also a Worker subrequest, so passing it a `/cdn-cgi/image/...` URL has the same 404 problem. Pattern: fetch bytes server-side via `cf.image`, base64-encode (chunked — `String.fromCharCode.apply` overflows past ~100k args), embed as `data:image/jpeg;base64,...`. Reference implementation: `app/api/og/driver/route.tsx`.

### Sources allowlist
Any new R2 bucket / external domain must be added to **Dash → Images → Transformations → Sources** before transforms will resolve. Without it, requests return `403 cf-not-resized: err=9524`.

---

## 21ST.DEV UI COMPONENTS

21st.dev is an open-source shadcn/ui-based component registry. Components are installed with:
```bash
npx shadcn@latest add "https://21st.dev/r/[author]/[component]"
```

### Install These During Shared Components Agent Build
```bash
npx shadcn@latest add "https://21st.dev/r/shadcn/card"
npx shadcn@latest add "https://21st.dev/r/shadcn/avatar"
npx shadcn@latest add "https://21st.dev/r/shadcn/badge"
npx shadcn@latest add "https://21st.dev/r/shadcn/button"
npx shadcn@latest add "https://21st.dev/r/shadcn/progress"
npx shadcn@latest add "https://21st.dev/r/shadcn/alert"
npx shadcn@latest add "https://21st.dev/r/shadcn/drawer"
npx shadcn@latest add "https://21st.dev/r/shadcn/sheet"
npx shadcn@latest add "https://21st.dev/r/shadcn/skeleton"
npx shadcn@latest add "https://21st.dev/r/shadcn/sonner"
npx shadcn@latest add "https://21st.dev/r/shadcn/tabs"
npx shadcn@latest add "https://21st.dev/r/shadcn/separator"
```

### UI Philosophy
- **Mobile-first always**: Design for 390px width first, scale up
- **Dark-mode ready**: Use CSS variables, never hardcode colors
- **Atlanta aesthetic**: Dark backgrounds, vibrant accent colors, bold typography
- **NO vibe-coded UI**: Every component must be intentional, accessible, premium
- **Feed paradigm**: The HMU broadcast feed is the core UI — treat it like a social app, not a booking form

---

## ENVIRONMENT VARIABLES

Never hardcode keys. Use `.env.local` locally, Cloudflare secrets in production.

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Neon
DATABASE_URL=                        # pooled connection
DATABASE_URL_UNPOOLED=               # for migrations only

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
HMU_FIRST_PRICE_ID=                  # Stripe Price ID for $9.99/mo subscription
STRIPE_PLATFORM_ACCOUNT_ID=

# Ably
ABLY_API_KEY=                        # server-side ONLY — NEVER expose to client
NEXT_PUBLIC_ABLY_CLIENT_ID=

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_VERIFY_SERVICE_SID=

# OpenAI
OPENAI_API_KEY=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
```

---

## NEON DATABASE SCHEMA

> Schema Agent owns ALL migrations. No other agent modifies schema directly.
> All agents import TypeScript types from `/lib/db/types.ts` — generated by Schema Agent.

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

## RIDE FLOW STATE MACHINE

> **THE PROMISE TO DRIVERS:** Your payment is secured the moment the rider gets in your car. We do not wait until the ride ends.
>
> **THE TRADE-OFF (locked, accepted 2026-05-07):** Once funds release at Start Ride, there is no in-flow money-clawback mechanism. Mid-ride complaints flow to the admin queue; ratings + text comments are the public accountability layer; Stripe chargebacks (weeks later, via rider's bank) and admin-initiated `transfer.reversal` are the only post-release reversal paths. Reversal can produce a negative driver Connect balance / debt to platform — accepted as the cost of a clean driver promise.

### Driver States
```
OFFLINE → AVAILABLE      (posts HMU broadcast, enters Ably Presence for area)
AVAILABLE → MATCHED      (taps HMU on rider's request)
MATCHED → OTW            (taps OTW — GPS tracking starts)
OTW → HERE               (arrives at pickup — no-show timer starts, rider notified)
HERE → STARTING          (taps Start Ride — checks run, see Start Ride Checks)
STARTING → RIDE_ACTIVE   (checks pass — funds capture + transfer to driver Connect)
RIDE_ACTIVE → ENDED      (taps End Ride — ride closes, ratings/comments unlocked)

Branch from HERE:
HERE → NO_SHOW           (driver triggers after timer expires + driver-at-pickup geofence + no extension active)
```

### Rider States
```
BROWSING → POSTED            (posts ride request to feed)
POSTED → MATCHED             (taps COO on driver — Stripe PaymentIntent created with manual capture, funds authorized)
MATCHED → LOCATION_SHARED    (shares geo or address — see GPS Sharing copy)
LOCATION_SHARED → BET        (taps BET — heading to car)
BET → CONFIRMING             (driver taps Start Ride — rider sees "Are you in the car?")
CONFIRMING → IN_RIDE         (rider taps yes OR auto-yes via co-motion heuristic — capture fires)
IN_RIDE → ENDED              (driver taps End Ride)
ENDED → RATE                 (rider + driver rate each other; text comments optional)

Branch from HERE / BET:
HERE → REQUESTING_EXTENSION  (rider asks for more time before no-show fires)
REQUESTING_EXTENSION → BET   (driver approves — wait fee added to ride total, timer extends)
REQUESTING_EXTENSION → BET   (driver declines — original timer continues; rider has option to cancel)
```

### Start Ride Checks (driver-initiated, single button tap)
1. **Pickup geofence** — driver GPS within `start_ride_pickup_geofence_m` of pickup location (default 150m, admin-configurable)
2. **Rider proximity** — driver GPS within `start_ride_rider_proximity_m` of rider GPS (default 100m, admin-configurable). **Skip this check if rider has not shared GPS.**
3. **Rider-in-car prompt** — rider sees "Are you in the car?" → tap yes
4. **Auto-yes (no rider tap)** — fires when ALL of: `auto_yes_timeout_sec` elapsed since prompt (default 120s, admin-configurable) AND driver GPS speed > `auto_yes_driver_speed_min_mps` (default 2 m/s ≈ walking pace, admin-configurable) AND rider GPS movement matches driver within `auto_yes_comotion_tolerance_pct` (default 20%, admin-configurable). Rationale: rider is heads-down in the app trying to find the driver — no news is good news as long as the car is moving with them in it.
5. **Auto-yes fallback (no rider GPS)** — flat `auto_yes_timeout_sec` after prompt + driver GPS moving → assume yes.
6. **All passed → capture fires.** Funds move from rider to driver Connect via Destination Charge with `application_fee_amount` set at capture (see STRIPE INTEGRATION).
7. **Cash-out unlocks** for the driver immediately. No platform-side hold beyond this point. (Stripe may impose its own holds — outside our control.)

### GPS Sharing copy (rider, surfaced on first prompt + any time GPS is missing at Start Ride)
> "GPS sharing protects you. Opting out makes it harder for drivers to find you and increases your no-show risk."

### Extension Flow (rider requests, driver approves)
- Rider taps "Request more time" while at HERE / BET → modal: *"Driver charges $X.XX/min for extra wait. Request 5 more minutes? +$X.XX"*
- Driver gets push: approve / decline
- Approve → `extension_minutes_per_grant` added to no-show timer (default 5 min), `wait_fee_per_minute × extension_minutes_per_grant` added to ride total, capture amount adjusts at Start Ride
- Caps: `extension_max_grants_per_ride` (default 3), `extension_max_total_minutes` (default 30) — admin-configurable

### UI Vocabulary (USE THESE EXACT STRINGS)
| Concept | Display Text |
|---|---|
| Driver goes live | "HMU" |
| Driver heading to rider | "OTW" |
| Driver arrived | "HERE" |
| Rider accepts + pays | "COO" |
| Rider heading to car | "BET" |
| Driver starts the ride | "Start Ride" |
| Rider-in-car prompt | "You in the car?" |
| Ride in progress | "Ride Active" |
| End ride | "End Ride" |
| Rider asks for more wait time | "Need a few more minutes" |
| Driver responds to extension | "Approve" / "Decline" |
| Driver triggers no-show | "No Show" |
| Mid-ride complaint (admin path, not money-clawback) | "Nah fam, that's not right" |
| Rating: good | "CHILL ✅" |
| Rating: great | "Cool AF 😎" |
| Rating: uncomfortable | "Kinda Creepy 👀" |
| Rating: safety concern | "WEIRDO 🚩" |

---

## MONETIZATION

### Payment Architecture
- **Rider payments**: Stripe — Apple Pay, Google Pay, card, debit
- **Driver payouts**: Dots API (dots.dev) — Cash App, Venmo, Zelle, PayPal, bank
- **Stripe fee**: 2.9% + $0.30 per transaction (absorbed by platform, never charged to rider or driver)
- **Dots fee**: ~$0.25–$0.50 flat per payout (varies by rail — see payout table below)
- **Platform fee**: Extracted BEFORE Dots payout, applied to net after Stripe fee

### Progressive Fee Structure — Free Tier

Fees use **cumulative daily earnings** per driver. Resets **midnight ET daily** and **Sunday midnight ET weekly**.

| Cumulative Daily Earnings | Platform Takes | Driver Keeps |
|---|---|---|
| First $50/day | 10% | 90% |
| $50–$150/day | 15% | 85% |
| $150–$300/day | 20% | 80% |
| Over $300/day | 25% | 75% |
| **Daily cap** | **$40 max** | — |
| **Weekly cap** | **$150 max** | — |

### HMU First Tier ($9.99/mo via Stripe Billing)

| All Earnings | Platform Takes | Driver Keeps |
|---|---|---|
| Flat rate | 12% | 88% |
| **Daily cap** | **$25 max** | — |
| **Weekly cap** | **$100 max** | — |

Additional HMU First perks vs Free:
- Instant payout after every ride (Free = next morning 6am batch)
- Priority placement in rider's driver feed
- Read rider comments
- HMU First badge on profile
- Lower daily + weekly cap

### Fee Calculation Logic (Payout Agent owns this)

```typescript
function calculatePlatformFee(
  rideNetAmount: number,        // after Stripe fee deducted
  driverTier: 'free' | 'hmu_first',
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number
): number {
  const DAILY_CAP = driverTier === 'hmu_first' ? 25 : 40
  const WEEKLY_CAP = driverTier === 'hmu_first' ? 100 : 150

  const remainingCap = Math.min(
    DAILY_CAP - dailyFeePaid,
    WEEKLY_CAP - weeklyFeePaid
  )
  if (remainingCap <= 0) return 0 // Cap hit — driver keeps everything

  let rate: number
  if (driverTier === 'hmu_first') {
    rate = 0.12
  } else {
    if (cumulativeDailyEarnings < 50) rate = 0.10
    else if (cumulativeDailyEarnings < 150) rate = 0.15
    else if (cumulativeDailyEarnings < 300) rate = 0.20
    else rate = 0.25
  }

  return Math.min(rideNetAmount * rate, remainingCap)
}
```

### Daily Earnings Table (Schema Agent must add this table)

```sql
CREATE TABLE daily_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES users(id),
  earnings_date DATE NOT NULL,
  week_start_date DATE NOT NULL,
  gross_earnings NUMERIC(10,2) DEFAULT 0,
  platform_fee_paid NUMERIC(10,2) DEFAULT 0,
  weekly_platform_fee_paid NUMERIC(10,2) DEFAULT 0,
  rides_completed INTEGER DEFAULT 0,
  daily_cap_hit BOOLEAN DEFAULT FALSE,
  weekly_cap_hit BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(driver_id, earnings_date)
);
CREATE INDEX idx_daily_earnings_driver_date ON daily_earnings(driver_id, earnings_date);
```

### Payout Methods via Dots — Fee Table

Platform adds arbitrage margin on top of Dots' actual cost. Driver sees net fee. Platform keeps spread.

| Method | Dots Cost (est) | Driver Fee Shown | Platform Arbitrage |
|---|---|---|---|
| Bank / ACH | ~$0.25 | FREE | $0.25 |
| Cash App | ~$0.25 | FREE | $0.25 |
| Venmo | ~$0.25 | FREE | $0.25 |
| Zelle / RTP | ~$0.50 | FREE | $0.50 |
| Debit card | ~1% | 0.5% | 0.5% |
| PayPal | ~1.5% | 1% | 0.5% |

**UI RULE on payout methods**: Show "FREE" for ACH, Cash App, Venmo, Zelle.
Frame: *"Cash App, Venmo, and bank are always free. Other methods may carry a small fee."*

**UI RULE on ride earnings**: Never show percentage. Always show two numbers only:
```
You kept:   $17.21
HMU took:   $1.91
```

When daily cap hits, show the viral moment:
```
You kept:   $20.00  🔥
HMU took:   $0.00
Daily cap hit — rest of today is ALL yours
```

### Rider OG Status
- **Trigger**: 10 completed rides + 0 open disputes → auto-granted
- **Perks**: Read driver comments, priority matching with HMU First drivers
- **Push**: "You're OG now. You can see what drivers really think. 🔥"

### Chill Score Formula
```
Chill % = ((CHILL count + (Cool AF count × 1.5)) / total ratings) × 100
```

---

## CAPTURE, RELEASE & FAILURE PATHS

> **Capture point is Start Ride** (driver tap + checks pass), not End Ride. There is no post-ride dispute window holding funds.

| Condition | Result |
|---|---|
| Start Ride checks pass (geofence + proximity + rider yes-or-auto-yes) | Capture fires → funds transfer to driver Connect → cash-out unlocks ✅ |
| Pickup geofence fails at Start Ride | Driver sees "You're not at the pickup yet" — capture does not fire, ride stays at HERE |
| Rider GPS proximity fails (rider sharing GPS) | Driver sees "You're not near your rider yet" — capture does not fire |
| Rider taps NO to "You in the car?" | Capture does not fire, ride stays at HERE; driver can re-attempt Start Ride after resolving |
| Driver ghosts after COO — no OTW in `driver_ghost_timeout_min` (default 30) | Auto-void authorization, rider notified 🔄 |
| Rider no-show: driver-at-pickup geofence + `no_show_timer_min` expired (default 10) + no active extension | Driver triggers No Show → 25% or 50% of fare captured (driver elects), per fee structure below 🚩 |
| Rider requests extension, driver declines, original timer expires | Same as no-show path |
| Mid-ride complaint by rider | Logged + admin queue. NOT a fund freeze — funds already with driver. Admin discretion → manual `transfer.reversal` if upheld 🛎️ |
| Post-ride dispute | Ratings + text comments only (public accountability layer). Money clawback path = Stripe chargeback (rider's bank, weeks later) or admin-initiated reversal |

**No-show fee structure** (driver-elected at No Show tap, per `payment_capture_spec` carryover):
- Driver picks 25% → platform takes 5%, rider refunded 70%
- Driver picks 50% → platform takes 10%, rider refunded 40%
- Add-ons / extras: 100% refunded to rider on no-show
- Cash rides: no charge on no-show; driver assumes the risk

**Reversal mechanics (when admin upholds a mid-ride or post-ride complaint):**
- Refund rider via `stripe.refunds.create` on the captured charge
- Reverse the destination transfer via `stripe.transfers.createReversal`
- If driver already cashed out, Connect balance goes negative → debt to platform (accepted risk)
- Admin action is logged in `transaction_ledger` with `reversal_reason`

---

## ABLY CHANNEL ARCHITECTURE (DO NOT DEVIATE)

```
ride:{ride_id}            → GPS, status updates during active ride
user:{user_id}:notify     → Personal push notifications
area:{area_slug}:feed     → Driver Presence per area (rider feed subscribes here)
admin:feed                → All system events → Admin dashboard
```

### Mandatory Rules
1. NEVER expose ABLY_API_KEY to client — issue scoped JWT from Cloudflare Worker only
2. Validate Clerk session BEFORE issuing any Ably token
3. Token scoped to only channels the user is allowed to access
4. Publish GPS every 10 seconds OR 50 meter movement — whichever is less frequent
5. If no GPS update in 90 seconds → show "Driver connection lost" + alert admin
6. Use Ably Presence API for driver availability feed — never poll database
7. Enable message persistence (72hr) on all ride:{ride_id} channels
8. Every Ably event MUST simultaneously write to Neon. Ably = realtime. Neon = truth.

---

## STRIPE INTEGRATION

### 0. UI: in-app only (LOCKED 2026-05-07)

**No Stripe-hosted page is ever shown to a rider or driver.** All Stripe UI renders inside the app via official Stripe components.

| Surface | What we use | Banned |
|---|---|---|
| Card entry, save card, Apple Pay / Google Pay / Cash App Pay | Stripe Elements / Payment Element rendered in our pages | Stripe Checkout (hosted) |
| Driver Connect onboarding (KYC, bank, SSN/EIN) | `@stripe/react-connect-js` `ConnectAccountOnboarding` in `app/driver/payout-setup/stripe-embedded.tsx`, backed by `app/api/driver/payout-setup/session/route.ts` (`stripe.accountSessions.create`) | `stripe.accountLinks.create` (returns connect.stripe.com URL) |
| Driver payout history + bank update | `ConnectPayouts` + `ConnectAccountManagement` in the same file | `stripe.accounts.createLoginLink` (returns express.stripe.com URL), Stripe Express Dashboard |
| Refund / dispute admin tooling | Built in our admin pages; Stripe API calls server-side | Stripe Dashboard share-links |

**Two unavoidable exceptions** (be honest — neither is "Stripe UI"):
- **3D Secure challenge** — when a rider's bank requires step-up auth, the *bank's* page loads via `stripe.handleNextAction`. This is the issuer's UI, not Stripe's, and we cannot avoid it.
- **Stripe-side risk holds** — Stripe may freeze a payout for fraud review. Server-only, no user-facing UI.

**Live leaks (do NOT add new callers — Phase B will rip these out):**
- `app/api/driver/payout-setup/update/route.ts` — both branches redirect off-app. Replace with `/driver/payout-setup` redirect (already renders the embedded view).
- `lib/stripe/connect.ts:createOnboardingLink` — helper that returns a hosted URL. Audit callers + delete.
- `lib/stripe/client.ts:createAccountLink` — helper that returns a hosted URL. Audit callers + delete.

### 1. Authorize at COO tap (rider accepts price — funds held, not yet captured)
```typescript
const paymentIntent = await stripe.paymentIntents.create({
  amount: rideAmountInCents,
  currency: 'usd',
  customer: rider.stripeCustomerId,
  capture_method: 'manual',                          // critical — capture happens later at Start Ride
  payment_method: rider.defaultPaymentMethodId,
  confirm: true,
  transfer_data: { destination: driver.stripeAccountId }, // Destination Charge — driver Connect is the eventual payee
  metadata: { rideId, driverId, riderId }
}, { idempotencyKey: `auth_${rideId}` });
```

### 2. Capture at Start Ride (checks passed — money moves rider → driver Connect)
```typescript
// Fee calculation reads driver tier + cumulative daily earnings AT THIS MOMENT.
// Reads admin-portal config: progressive tier table, caps, HMU First flat rate.
const feeRate = calculatePlatformFeeRate({
  driverTier,
  cumulativeDailyEarnings,
  dailyFeePaid,
  weeklyFeePaid,
});

await stripe.paymentIntents.capture(paymentIntentId, {
  amount_to_capture: rideAmountInCents,                  // includes any extension wait fees added at HERE
  application_fee_amount: Math.round(rideAmountInCents * feeRate),
  // transfer_data.destination already set on the PaymentIntent at authorize — do not re-pass here
}, { idempotencyKey: `capture_${rideId}` });

// Cash-out unlocks for driver immediately. No platform-side hold.
// transaction_ledger gets a `capture` row + `transfer_to_connect` row.
```

### 3. Per-extra incremental capture (driver-menu add-ons during ride)
Each extra ordered mid-ride is its own atomic money event:
```typescript
const extraIntent = await stripe.paymentIntents.create({
  amount: extraAmountInCents,
  currency: 'usd',
  customer: rider.stripeCustomerId,
  payment_method: rider.defaultPaymentMethodId,
  off_session: true,
  confirm: true,                                          // immediate capture
  application_fee_amount: Math.round(extraAmountInCents * currentFeeRate), // recalculated against daily earnings AT THIS MOMENT
  transfer_data: { destination: driver.stripeAccountId },
  metadata: { rideId, extraId, driverId, riderId, kind: 'extra' }
}, { idempotencyKey: `extra_${extraId}` });
```

### 4. No-show capture (driver elects 25% or 50% at No Show tap)
```typescript
const noShowAmount = Math.round(rideAmountInCents * (driverElected === '50' ? 0.5 : 0.25));
const noShowFeeRate = driverElected === '50' ? 0.10 : 0.05; // platform's cut of the no-show

await stripe.paymentIntents.capture(paymentIntentId, {
  amount_to_capture: noShowAmount,
  application_fee_amount: Math.round(noShowAmount * noShowFeeRate),
}, { idempotencyKey: `noshow_${rideId}` });
// Stripe auto-voids the difference on partial capture. Add-ons / extras refunded separately.
```

### 5. Reversal (admin upholds a complaint)
```typescript
const refund = await stripe.refunds.create({
  payment_intent: paymentIntentId,
  amount: rideAmountInCents,
  reverse_transfer: true,                                 // pulls funds back from driver Connect
  refund_application_fee: true,
}, { idempotencyKey: `reversal_${rideId}` });
// If driver already cashed out, Connect balance goes negative — accepted risk.
```

### 6. Driver Connect Onboarding (on Clerk user.created webhook)
The `stripe.accounts.create` call below provisions the Connect account. **Do not** follow it with `stripe.accountLinks.create` — that returns a Stripe-hosted onboarding URL and violates the in-app-only lock above. The driver completes KYC/bank setup inside our app via the embedded `ConnectAccountOnboarding` component, gated by an `accountSession` client secret minted at `app/api/driver/payout-setup/session/route.ts`.

```typescript
const account = await stripe.accounts.create({
  type: 'express',
  country: 'US',
  email: clerkUser.primaryEmailAddress,
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true }
  },
  settings: {
    payouts: { schedule: { interval: 'manual' } } // platform code triggers payouts; no Stripe auto-schedule
  }
});
await clerkClient.users.updateUserMetadata(clerkUserId, {
  publicMetadata: { stripeAccountId: account.id }
});
// Driver visits /driver/payout-setup → server calls stripe.accountSessions.create → embedded onboarding renders.
```

### Idempotency keys (required on every Stripe call)
- `auth_${rideId}` — initial authorization at COO
- `capture_${rideId}` — main capture at Start Ride
- `extra_${extraId}` — per-extra incremental capture
- `noshow_${rideId}` — no-show partial capture
- `reversal_${rideId}` — admin-initiated reversal

The webhook handler (`app/api/webhooks/stripe/route.ts`) must dedupe inbound events by `event.id` before processing — see `stripe_webhook_idempotency_bug` memory.

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

---

## MCP TOOLS — RUNTIME API (Cloudflare Workers)

| Tool | Method | Endpoint |
|---|---|---|
| `check_driver_availability` | GET | `/api/tools/drivers/available` |
| `hold_payment` | POST | `/api/tools/payment/hold` |
| `release_payment` | POST | `/api/tools/payment/release` |
| `refund_payment` | POST | `/api/tools/payment/refund` |
| `track_ride` | POST | `/api/tools/ride/track` |
| `flag_dispute` | POST | `/api/tools/dispute/flag` |
| `sentiment_check` | POST | `/api/tools/sentiment/check` |
| `upgrade_rider` | POST | `/api/tools/rider/upgrade` |
| `notify_user` | POST | `/api/tools/notify` |
| `calculate_savings` | GET | `/api/tools/driver/savings` |
| `issue_ably_token` | POST | `/api/tools/ably/token` |
| `check_proximity` | POST | `/api/tools/geo/proximity` |

### `.claude.json` — MCP Server Config (project root)
```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp"],
      "env": { "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}" }
    },
    "neon": {
      "command": "npx",
      "args": ["-y", "@neondatabase/mcp-server-neon"],
      "env": { "NEON_API_KEY": "${NEON_API_KEY}" }
    },
    "cloudflare": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server-cloudflare"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "${CLOUDFLARE_ACCOUNT_ID}",
        "CLOUDFLARE_API_TOKEN": "${CLOUDFLARE_API_TOKEN}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

---

## FRAUD PREVENTION

| Layer | Mechanism | Trigger |
|---|---|---|
| Identity | Twilio Verify phone OTP | Signup |
| Identity | Admin reviews video intro before activation | Signup |
| Identity | Vehicle photo + plate required (drivers) | Driver signup |
| Payment | Stripe Radar default + custom rules | Every payment |
| Payment | 3D Secure on new cards (first 30 days) | First transaction |
| Payment | Velocity: max 3 rides/24hr (accounts <30 days) | Every ride |
| Behavioral | Dispute count public on all profiles | Ongoing |
| Behavioral | WEIRDO ×3 from different users = admin review | Post-ride |
| Behavioral | Mutual WEIRDO within 5min = retaliation flag | Post-ride |
| Behavioral | No-show ×3 = account review | Ride events |
| Content | OpenAI GPT-4o-mini sentiment on every comment | Comment submit |
| API | Upstash Redis rate limiting on all routes | Every request |
| Geo | Proximity mismatch on End Ride = admin flag | End ride |

---

## AGENT BUILD PLAN

### TIER 1 — Foundation (Sequential — in this exact order)
```
01-schema-agent          Neon schema, TypeScript types, migrations
02-auth-agent            Clerk config, webhooks, Stripe Connect provisioning
03-infra-agent           Cloudflare setup, Ably architecture, env config
04-shared-components     Design system, 21st.dev installs, HMU card, rating widget
```

### TIER 2 — Feature (Parallel after Tier 1)
```
05-driver-profile        Profile UI, video upload, HMU First sub flow
06-rider-profile         Profile UI, OG Status display, payment link
07-hmu-broadcast         Feed UI, Ably Presence, area matching logic
08-ride-tracking         Status machine, GPS, Mapbox, ride UI
09-transaction           Stripe escrow hold/capture, COO flow
10-dispute               45min timer, dispute UI, admin queue
11-payout                Tier-based payout, instant vs batch
12-engagement            Rating UI, comments, sentiment, OG auto-upgrade
13-admin                 Live map, dispute queue, account management, video review queue
14-notification          Web Push + Twilio, countdown notifications
15-analytics             PostHog events on every user action
```

### TIER 3 — Cross-Cutting (Parallel — last)
```
16-security              Rate limiting, middleware audit, Stripe Radar rules
17-qa-testing            Integration tests, Playwright E2E
18-marketing             SEO pages, social share cards, virality loop
19-deployment            Cloudflare deploy — runs only after QA passes
```

### All Agents Must Follow These Rules
1. NEVER modify Neon schema directly — route all changes through Schema Agent
2. Import TypeScript types from `/lib/db/types.ts` only
3. All API routes must have Clerk auth middleware
4. All API routes must have Upstash rate limiting
5. Every user action fires a PostHog event
6. Commit to your own Git branch — never commit to main directly
7. Document your owned files in your SCOPE section below

---

## DEFINITION OF DONE (MVP)

A feature is complete when all of the following are true:
- [ ] Renders correctly on mobile Chrome at 390px width
- [ ] Clerk auth middleware protects the route
- [ ] Writes to Neon (source of truth — not just Ably)
- [ ] Ably event fires if it is a realtime feature
- [ ] PostHog event fires for the user action
- [ ] Upstash rate limiting applied
- [ ] Sentry error boundary in place
- [ ] Passes QA Agent integration tests

---

## PAYMENT ARCHITECTURE (LOCKED)

### Charge Type: Destination Charges
- Rider pays the HMU ATL platform Stripe account
- Platform transfers net amount to driver's Stripe Connect account
- `application_fee_amount` calculated and set at **capture time** (not create)
- Capture time = **Start Ride** (driver tap + checks pass), not ride end. See RIDE FLOW STATE MACHINE for the full check chain.
- Per-extra captures recalculate the fee against daily-earnings tier at the moment of each extra

### Payment Flow
```
COO tap → authorizeRiderPayment()    [manual capture, transfer_data set]
  → HERE → no-show timer + optional rider extension requests
  → Driver Start Ride → checks pass → captureRiderPayment()
       ↳ Funds move rider → driver Connect via Destination Charge
       ↳ application_fee_amount calculated against current daily earnings
       ↳ Cash-out unlocks for driver immediately
  → Ride Active (extras add their own incremental captures)
  → Driver End Ride → ratings + comments unlocked
  → Mid-ride or post-ride complaints → admin queue (no automatic clawback)
```

### Driver Payouts
- **Stripe Connect Express** — bank + debit (LIVE)
- **Dots API** — Cash App, Venmo, Zelle, PayPal — **ASPIRATIONAL** (not implemented, $999/mo API tier)
- **Cash-out timing**: driver-triggered any time after Start Ride completes. No platform-side hold. Standard payout free, instant payout per `payout_strategy` memory ($1 or 1% on free tier; free for HMU First).
- Cron-batch payouts: post-launch only

### Rider Payment Methods
- Saved via Stripe SetupIntents (off_session usage)
- Stored in `rider_payment_methods` table
- Apple Pay, Google Pay, Cash App Pay supported via Stripe

### Three Price Modes
1. **Rider proposes** — rider names their price, drivers accept or pass
2. **Auto-calculated** — system suggests based on distance/time/stops
3. **Driver fixed** — driver posts minimum, rider takes it or leaves it

### Wait Fee (NEW — net-new schema/UI)
- Driver sets per-minute wait fee in profile, within admin-defined band (default $0.25–$2.00/min, suggested $0.50/min)
- Triggered when rider requests extension at HERE and driver approves
- Added to ride total before capture; rider sees concrete dollar amount in the request prompt

### Key Tables
- `rider_payment_methods` — saved cards
- `price_negotiations` — price proposal tracking
- `transaction_ledger` — full audit trail for all money movement (includes reversals)
- `daily_earnings` — progressive fee tier tracking
- `processed_webhook_events` — Stripe event-id dedup (NEW — see `stripe_webhook_idempotency_bug` memory)
- `ride_extensions` — extension requests + approvals + wait-fee amounts (NEW)
- `rides` columns: price_mode, proposed_price, final_agreed_price, payment tracking fields, `cashout_eligible_at` (set when capture succeeds)

### Admin-Configurable Thresholds (read at Start Ride / extension / no-show)
| Key | Default | Purpose |
|---|---|---|
| `start_ride_pickup_geofence_m` | 150 | Driver-to-pickup distance allowed for Start Ride |
| `start_ride_rider_proximity_m` | 100 | Driver-to-rider GPS distance allowed (skipped if rider hasn't shared GPS) |
| `auto_yes_timeout_sec` | 120 | Time after rider prompt before auto-yes can fire |
| `auto_yes_driver_speed_min_mps` | 2 | Driver GPS speed threshold for "car is moving" |
| `auto_yes_comotion_tolerance_pct` | 20 | Allowed delta between driver and rider GPS movement to confirm co-motion |
| `no_show_timer_min` | 10 | Time at HERE before no-show can be triggered |
| `extension_minutes_per_grant` | 5 | Minutes added per approved extension |
| `extension_max_grants_per_ride` | 3 | Max extensions per ride |
| `extension_max_total_minutes` | 30 | Hard cap on total extension time per ride |
| `wait_fee_min_per_min` | 0.25 | Min wait fee a driver can set |
| `wait_fee_max_per_min` | 2.00 | Max wait fee a driver can set |
| `wait_fee_suggested_per_min` | 0.50 | Suggested default in driver profile |
| `comments_visibility_default` | `visible` | Default visibility for post-ride text comments |
| `driver_ghost_timeout_min` | 30 | Time after COO before auto-void if driver hasn't tapped OTW |

---

## FAST FOLLOW — NEXT SESSION PRIORITIES

These are built in schema but NOT yet implemented in code:

| Priority | Feature | Status |
|---|---|---|
| P0 | Price negotiation flow (3 modes) | Schema ready, lib/payments/negotiation.ts needed |
| P0 | Payment workflow orchestrator | Schema ready, lib/payments/workflow.ts needed |
| P1 | Transaction ledger queries | Table exists, lib/payments/ledger.ts needed |
| P1 | Payout router (Stripe transfers + batch) | lib/payments/payout-router.ts needed |
| P1 | Stripe webhook handler (full) | Expand app/api/webhooks/stripe/route.ts |
| P2 | Real-time financial UI via Ably | Push payment events to ride channel |
| P2 | Rider payment UI (saved cards, add/remove) | Frontend components needed |
| P2 | Driver earnings visualization (daily/weekly) | Frontend components needed |
| P3 | Dots integration | Blocked on Dots API access ($999/mo) — evaluate alternatives |
| P3 | Price auto-calculator with Turf.js | lib/payments/price-calculator.ts |

### HMU/Link feature (Phase 1 — schema shipped 2026-04-23, UI/API pending)

Driver-to-rider directed interest signal with match-on-link unmasking. Schema is live; full spec at `memory/hmu_link_feature_phase1.md`.

| Priority | Piece | Status |
|---|---|---|
| P0 | `POST /api/driver/hmu` — send HMU (enforce cap via `platform_config`, insert into `driver_to_rider_hmus`, Ably push to rider, insert `user_notifications` row) | New |
| P0 | `POST /api/rider/hmu/[id]/link` — flip status to `linked`, set `linked_at`, notify driver | New |
| P0 | `POST /api/rider/hmu/[id]/dismiss` — status `dismissed`, insert `blocked_users` row (rider → driver, one-way) | New |
| P0 | `POST /api/rider/linked/[driverId]/unlink` — status `unlinked`, re-masks rider | New |
| P0 | `/driver/find-riders` page — masked rider cards, HMU button, daily cap counter | New — reuse 4:3 media container from `/rider/browse` |
| P0 | `/rider/linked` page — accepted drivers, existing booking flow CTA | New |
| P0 | `/rider/home` — "HMU'd you" inbox section with badge count from `user_notifications` | Extend |
| P1 | Driver Ably presence on `market:{slug}:drivers_available` (token already permits subscription; publisher missing) | New |
| P1 | `/admin/hmu-config` + `/admin/hmus` — market-filtered via `useMarket()` pattern | New |
| P1 | Gender data normalization — `driver_profiles.gender` has mixed legacy (`male`/`female`) + new (`man`/`woman`) values. Normalize to one vocab, backfill `users.gender`. | Data cleanup |
| P2 | Rider `home_areas` picker in settings (reuse driver area-picker) | New |
| P2 | Cloudflare Images blurhash for masked avatars (MVP uses CSS blur which is DevTools-bypassable) | Upgrade |
| P2 | voip.ms proxy pair for in-HMU messaging (Phase 2 of the feature) | New |

**Phase 1 status (2026-04-23):** schema + gender filter on `/rider/browse` shipped. API + UI to be picked up in dedicated session — do NOT wedge into unrelated work.

### Admin RBAC — finish route mapping (shipped 2026-04-30 as default-deny)

13 admin routes (Safety, Ride Requests, HMUs, Markets, Feature Flags, HMU Config, Onboarding Config, Realtime Banners, Maintenance, VoIP Debug, Playbook FB Groups, Conversation Agent, Chat Booking) currently have no `permission` slug. The sidebar + search filter default-denies them to non-super admins as a stopgap. To support partial access for custom roles, give each route an explicit slug, add to the matrix in `app/admin/roles/permission-matrix.tsx`, and tag in both `app/admin/components/admin-sidebar.tsx` and `lib/admin/search-manifest.ts`. Full proposed slug-per-route mapping at `memory/rbac_unmapped_routes_followup.md`.

---

## POST-MVP ROADMAP (Schema Must Accommodate)

| Phase | Feature |
|---|---|
| Post-MVP v1 | Service Booking (Barber, Tattoo) — separate flow, own agent |
| Post-MVP v1 | Pickup/Delivery (Grocery, Products) — own state machine |
| Post-MVP v1 | SMS → App: text "HMU $15 Rides Decatur" → auto-creates post via Twilio webhook |
| Post-MVP v2 | Driver background check (optional paid add-on) |
| Post-MVP v2 | Ride scheduling (book for tomorrow, recurring) |
| Post-MVP v2 | Referral system ($5 credit) |
| Post-MVP v3 | OG Rider paid fast-track |
| Post-MVP v3 | In-app pre-ride chat |

---

*Claude Code reads this file automatically at the start of every session.*
*Each agent's CLAUDE.md appends its specific SCOPE section below this line.*

---
## AGENT SCOPE — [REPLACE THIS WITH AGENT NAME]

**This agent owns:**
- (list files and directories)

**This agent does NOT touch:**
- (list explicitly)

**Definition of done for this agent:**
- (specific acceptance criteria)
