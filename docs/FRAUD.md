# FRAUD PREVENTION — Multi-Layer Security

> **Part of HMU ATL documentation suite.** See [CLAUDE.md](../CLAUDE.md) for core project context.

---

## PREVENTION LAYERS

| Layer | Mechanism | Trigger |
|---|---|---|
| **Identity** | Twilio Verify phone OTP | Signup |
| **Identity** | Admin reviews video intro before activation | Signup |
| **Identity** | Vehicle photo + plate required (drivers) | Driver signup |
| **Payment** | Stripe Radar default + custom rules | Every payment |
| **Payment** | 3D Secure on new cards (first 30 days) | First transaction |
| **Payment** | Velocity: max 3 rides/24hr (accounts <30 days) | Every ride |
| **Behavioral** | Dispute count public on all profiles | Ongoing |
| **Behavioral** | WEIRDO ×3 from different users = admin review | Post-ride |
| **Behavioral** | Mutual WEIRDO within 5min = retaliation flag | Post-ride |
| **Behavioral** | No-show ×3 = account review | Ride events |
| **Content** | OpenAI GPT-4o-mini sentiment on every comment | Comment submit |
| **API** | Upstash Redis rate limiting on all routes | Every request |
| **Geo** | Proximity mismatch on End Ride = admin flag | End ride |

---

## IDENTITY VERIFICATION

### Phone OTP (Twilio Verify)
- **Trigger**: New user signup (rider or driver)
- **Flow**: User enters phone → Twilio sends 6-digit code → user verifies
- **Anti-spam**: Same phone can't create >1 account without admin approval
- **Stored**: `users.phone` (hashed), `users.phone_verified_at`

### Video Intro (Drivers Only)
- **Trigger**: Driver completes profile setup
- **Flow**:
  1. Driver records 15-30sec selfie video via device camera
  2. Video uploaded to Cloudflare R2
  3. Admin reviews video in queue (`/admin/video-review`)
  4. Admin approves → `users.account_status = 'active'`
  5. Admin rejects → `users.account_status = 'suspended'` + notification
- **Purpose**: Verify real person, match photo to video, assess trustworthiness
- **Stored**: `users.video_intro_url`

### Vehicle Verification (Drivers Only)
- **Required fields**:
  - `driver_profiles.vehicle_photo_url` (must show plate clearly)
  - `driver_profiles.license_plate`
- **Admin check**: Cross-reference plate with photo during video review
- **Flag**: Plate mismatch or stock photo → manual review queue

---

## PAYMENT FRAUD

### Stripe Radar
- **Default rules**: Enabled on all transactions
- **Custom rules** (added via Stripe Dashboard):
  - Block cards from high-risk countries (non-US billing)
  - Flag if card CVC fails 2+ times
  - Elevated risk if velocity >3 rides in 1 hour

### 3D Secure (3DS)
- **Trigger**: First transaction on a new card (first 30 days after account creation)
- **Implementation**: Stripe handles via `stripe.handleNextAction`
- **UX**: Bank's 3DS challenge page loads in-app (unavoidable bank UI, not Stripe)
- **After 30 days**: 3DS removed to improve conversion

### Velocity Limits
- **New accounts (<30 days)**: Max 3 rides per 24 hours
- **Enforced**: API middleware checks `users.created_at` + `rides.created_at` count
- **Bypass**: Admin can whitelist account for higher limits

---

## BEHAVIORAL SIGNALS

### Dispute Count
- **Public visibility**: All users see `users.dispute_count` on profiles
- **Threshold**: 3+ disputes = "High Dispute" badge (red flag)
- **Resolution impact**: Resolved disputes (in user's favor) reduce count by 50%

### WEIRDO Flag System
- **Trigger**: Post-ride rating where rater selects "WEIRDO 🚩"
- **Auto-review**: 3+ WEIRDO ratings from different users → admin queue
- **Retaliation detection**: Mutual WEIRDO within 5 minutes → both flagged, admin reviews context
- **Action**: Admin can suspend account or mark as false flag

### No-Show Pattern
- **Trigger**: Driver marks "No Show" 3+ times in 7 days
- **Auto-action**: Account review queue (potential rider abuse or driver gaming system)
- **Admin check**: Review GPS logs + Ably history for each no-show

---

## CONTENT MODERATION

### Sentiment Analysis (OpenAI GPT-4o-mini)
- **Trigger**: Every text comment submitted post-ride
- **Stored**: `comments.sentiment_score` (0-1), `comments.sentiment_flags` (array)
- **Flags**: `['harassment', 'explicit', 'threat', 'hate']`
- **Auto-hide**: Comments flagged `threat` or `hate` → `comments.is_visible = false` + admin queue
- **API**: `POST /api/tools/sentiment/check`

### Admin Review Queue
- **Path**: `/admin/comments` → filter by `flagged_for_review = true`
- **Actions**: Approve (unhide), Delete, Suspend author

---

## API RATE LIMITING (Upstash Redis)

### Limits by Route Type

| Route Type | Limit | Window |
|---|---|---|
| Auth endpoints (signup, login) | 5 req/min | Per IP |
| Payment endpoints | 10 req/min | Per user |
| HMU feed refresh | 30 req/min | Per user |
| GPS publish | 120 req/min | Per ride (10s cadence) |
| Admin endpoints | 60 req/min | Per admin user |

### Enforcement
- **Middleware**: `lib/middleware/rate-limit.ts` wraps all API routes
- **Response**: `429 Too Many Requests` + `Retry-After` header
- **Logging**: Rate limit hits logged to PostHog + Sentry

---

## GEO VERIFICATION

### Proximity Mismatch at End Ride
- **Check**: Compare `rides.driver_geo_at_end` with `rides.rider_geo_at_end`
- **Threshold**: >500m apart = flag
- **Admin action**: Review GPS trail in `ride_locations` table
- **Potential causes**: GPS spoofing, driver/rider collusion, legitimate edge case (dropped pin vs actual location)

### Start Ride Geofence
- **Check**: Driver GPS within 150m of `rides.pickup_lat/lng` (admin-configurable)
- **Enforcement**: Server-side validation before capture fires
- **Bypass**: Not allowed — hard requirement for capture

---

## ADMIN TOOLS

### Fraud Dashboard
- **Path**: `/admin/fraud`
- **Metrics**:
  - Dispute rate by user
  - No-show rate by user
  - WEIRDO flag count
  - Rate limit violations
  - Sentiment flags

### Manual Actions
- **Suspend account**: Blocks all new rides, keeps data intact
- **Ban account**: Soft delete, cannot re-signup with same phone
- **Reverse transaction**: Admin-initiated Stripe reversal (see [Payments](./PAYMENTS.md))

---

## RELATED DOCS
- [Payments](./PAYMENTS.md) — Reversal mechanics, Stripe Radar rules
- [Ride Flow](./RIDE-FLOW.md) — Geofence checks, no-show handling
- [Schema](./SCHEMA.md) — `disputes`, `comments`, `ratings` tables
