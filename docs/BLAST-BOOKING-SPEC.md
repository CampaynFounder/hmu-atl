# Blast Booking — Spec

> Status: DRAFT v2 (2026-05-12)
> Owner: founder@kikbac.ai
> Goal: convert unauthenticated rider traffic into authenticated, deposit-paid, matched-driver rides at the highest possible rate.

**v2 changes from v1 (founder decisions 2026-05-12):**
- Deposit-only for ALL blasts regardless of PricingStrategy cohort
- Photo upload required; gated AFTER Clerk + profile creation, BEFORE deposit
- Cross-device draft recovery is OUT OF SCOPE; localStorage only, `blast_drafts` table dropped
- Drivers do NOT get a new inbox — blasts arrive via existing ride-request flow; no `/driver/blasts` page, no `/api/driver/blast/*` routes
- Max drivers notified per blast capped at 10 (was 8); HMU First prioritization is a Phase 2 lever once volume warrants
- Counter-price displayed explicitly to rider ("you offered $25 → driver counters $30")
- Same-driver re-blast dedupe window: 30min per driver
- `blast_sms_kill_switch` ships available but defaults OFF (SMS active day 1)

---

## 1. Why this exists

`/rider/browse` shows live drivers, but the rider has to pick one and start an HMU thread. That's a single-throw funnel: one driver, one yes/no, no fallback. Most riders don't know who to pick, so they bounce.

**Blast** flips it: the rider says "here's my trip" and the system fans the request out to multiple matching drivers in parallel. Drivers HMU back. Rider picks the one they like. Conversion lift comes from (a) parallel offers instead of serial DMs, (b) auth-after-commit instead of auth-first, (c) a deposit pre-auth that filters tire-kickers without scaring real riders.

Lives at `/rider/browse/blast`. Reuses existing rider/browse driver grid for the "before you blast" view (social proof: real drivers, real photos).

---

## 2. End-to-end flow

```
unauth /rider/browse/blast
  ├─ sees full driver grid (reuses RiderBrowseClient — no per-card HMU)
  ├─ "Find a Ride" sticky CTA
  └─ taps CTA
        ↓
form (still unauth, localStorage'd)
  ├─ pickup pin (Mapbox)
  ├─ dropoff pin (Mapbox)
  ├─ one-way / round-trip
  ├─ when (Now / +1hr / Tonight / Tomorrow / pick a time)
  ├─ storage Y/N
  ├─ price (default = admin-configurable, suggested by distance)
  ├─ driver preference (M / F / Any)
  └─ tap "Send to Drivers"
        ↓
auth gate (Clerk OTP)  ← FIRST auth touch
        ↓
rider profile (only if incomplete)
  └─ screen name (required) — minimum field
        ↓
photo upload (HARD GATE — cannot send blast without this)
  └─ camera or library; safety feature, no skip
        ↓
deposit pre-auth (Stripe PaymentIntent, capture_method='manual', deposit_only ALWAYS)
  └─ if no card on file → setup intent inline → re-try
        ↓
blast created (hmu_posts row, post_type='blast')
  ├─ matching algorithm scores eligible drivers
  ├─ top 10 notified (push + SMS via voip.ms, opt-in respecting)
  └─ rider routed to /rider/blast/[id]
        ↓
drivers receive in their EXISTING ride-request inbox
  └─ no new driver UI; uses current Pass/HMU/Counter buttons
        ↓
/rider/blast/[id] — live offer board
  ├─ countdown (default 15 min, configurable)
  ├─ list of drivers who tapped HMU (animated glide-in)
  │     ├─ photo / video / chill score / distance / counter price (if any)
  │     └─ "Match" button per row
  └─ rider taps Match
        ↓
match locks → ride created (status='matched')
  ├─ deposit held (deposit_only strategy, ALWAYS)
  ├─ losing drivers notified "ride taken" via existing notify path
  └─ rider redirected to /ride/[id] — normal Pull Up flow takes over
```

If **no driver HMUs** before timeout: rider sees fallback prompt — bump price / extend / cancel-with-refund. Deposit auto-voids on cancel.

---

## 3. Page-by-page UX

### 3.1 `/rider/browse/blast` (unauth allowed)

Reuses existing `app/rider/browse/rider-browse-client.tsx` driver grid in **read-only mode** — no HMU button on cards, no driver detail drawer. The grid is social proof, not the action surface.

Sticky bottom CTA: **"Find a Ride →"** — full-width, primary brand color, subtle pulse animation (1.2s ease-in-out, opacity 0.92 ↔ 1.0) so it stays magnetic without being obnoxious.

Top of grid: small banner — *"Tell us where you're headed. Drivers HMU back. You pick."* Two-line subhead so the user knows what's about to happen.

### 3.2 `/rider/blast/new` (unauth allowed, form)

Single-screen vertical form. Each field in its own card-style block. Tapping a block expands it inline (accordion-style); only one block expanded at a time.

| Block | Default | Expanded UI |
|---|---|---|
| **Pickup** | "Where are you?" | Mapbox pin drop + address autocomplete (Mapbox Geocoding API). Auto-fills if location permission granted. |
| **Dropoff** | "Where to?" | Same as pickup. |
| **Trip type** | "One way" | Two pill buttons: One way / Round trip. |
| **When** | "Now" | Chips: Now • +1hr • Tonight (8pm) • Tomorrow morning (9am) • Pick time. Custom time uses native date+time picker, validated server-side as ≥ now + 5 min. |
| **Storage** | Off | Toggle. Help text: "Bringing bags, groceries, or anything bigger than a backpack? Toggle on so drivers know." |
| **Your price** | `$25` (admin-configurable per market) | Number stepper +$5/-$5, with suggested value computed from `pickup→dropoff` straight-line distance × per-mile rate (configurable). Cap at admin-defined max. |
| **Driver preference** | Any | Three pills: M / F / Any. |

Live total preview at the bottom: *"Your trip — $30 (incl. $5 wait buffer)"* — reduces sticker shock at deposit screen.

CTA: **"Send to Drivers ($X deposit)"** — copy explicitly names the deposit amount so the auth screen isn't a surprise.

**localStorage**: every field change writes to `localStorage['blast_draft']` with a 1hr TTL. On page mount, hydrate from draft. After successful blast creation, clear.

### 3.3 Auth gate

If unauth, tap on "Send to Drivers" routes to `/sign-in?redirect=/rider/blast/checkout`. Existing Clerk flow. localStorage draft survives the round-trip.

### 3.4 Rider profile (only if `rider_profiles` row missing or `display_name IS NULL`)

Reuses `app/api/onboarding/rider-profile-fields-config` to fetch which fields are required. **For the blast funnel: only `display_name` is required at this step.** All other admin-configured fields defer to post-first-ride.

Single field. Submit → next step.

### 3.4b Photo upload (HARD GATE)

Photo is a safety feature for drivers — they need to recognize who they're picking up. **No skip button.** Cannot proceed to deposit until photo is uploaded.

UI: camera button (preferred on mobile, opens native camera) + "Choose from library" fallback. Auto-compress in-browser before upload (reuse pattern from commit `11e97e7` admin pitch video compressor). Upload to R2 via existing photo-upload route. Update `users.video_intro_url` or appropriate column on success.

Copy: *"Drivers want to know who they're picking up. Snap a quick photo — this is a safety thing."*

### 3.5 Deposit pre-auth

If rider has no saved payment method:
- Inline Stripe Elements (Payment Element, Apple Pay / Google Pay surfaced first).
- Card saved via SetupIntent for re-use.

Then fire `paymentIntents.create({ capture_method: 'manual', amount: depositCents })`.

**Deposit-only is forced for ALL blasts**, regardless of the rider's PricingStrategy cohort. Rationale: blast is the conversion-critical moment; we minimize friction to protect the funnel. Implementation: skip the strategy resolver and call `lib/payments/escrow.ts:holdRiderPayment()` with `mode: 'deposit_only'` explicitly. Deposit amount = `min(depositPercent × fare, max_deposit_cents)` from `blast_matching_v1.deposit` config.

### 3.6 `/rider/blast/[id]` (live offer board)

This is the page that has to feel premium.

**Header**: Trip summary (pickup → dropoff, time, price), small "Cancel" button (text-only, secondary).

**Countdown bar**: top-of-screen progress bar, 15-min default, ticks down smoothly. Color shifts from brand to amber at 5 min, red at 1 min. Configurable in admin.

**"Drivers reaching out"** section:
- Empty state: animated dots + *"Notifying X drivers in your area…"*
- As drivers HMU, cards **glide in from the right** (250ms ease-out, opacity 0→1, translateX +24px → 0). Reuse existing pattern from commit `10c1ed6` (driver-home incoming-ride animation) — same component family.
- Each card: driver photo (or avatar initial), screen name, chill score badge, distance from pickup ("0.8 mi away"), counter price if different from rider's offer (badge: *"Counter: $30"*), short bio if present, "Match" button.
- Tapping the card expands it inline (no full-screen drawer): video intro (if exists), full bio, vehicle photo, chill score breakdown.

**No drivers yet, 5 min in**: subtle prompt — *"Haven't heard back? Try +$5 to widen the search"* — single-tap bump-and-rebroadcast.

**Match tap** → optimistic UI lock (button → spinner → checkmark, 800ms), redirect to `/ride/[id]`.

### 3.7 No-match fallback (countdown hits 0, zero HMUs)

Modal: *"No drivers picked up your trip. Try one of these:"*
- **Bump price** (+$5 / +$10 / +$20) → re-blasts to wider radius, extends countdown
- **Try a different time** → returns to form pre-populated
- **Cancel & refund** → voids PaymentIntent, returns to `/rider/browse/blast`

---

## 4. Schema

All migrations live in `lib/db/migrations/`. Naming: `2026-05-12-blast-booking.sql`.

### 4.1 `hmu_posts` extensions

Reuse existing table; add:

```sql
ALTER TABLE hmu_posts
  ADD COLUMN IF NOT EXISTS pickup_lat NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS pickup_lng NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS pickup_address TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_lat NUMERIC(10,8),
  ADD COLUMN IF NOT EXISTS dropoff_lng NUMERIC(11,8),
  ADD COLUMN IF NOT EXISTS dropoff_address TEXT,
  ADD COLUMN IF NOT EXISTS trip_type TEXT CHECK (trip_type IN ('one_way','round_trip')),
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storage_requested BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS driver_preference TEXT CHECK (driver_preference IN ('male','female','any')) DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS deposit_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES markets(id),
  ADD COLUMN IF NOT EXISTS expires_at_override TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bump_count INTEGER DEFAULT 0;

-- Extend post_type CHECK to include 'blast'
ALTER TABLE hmu_posts
  DROP CONSTRAINT IF EXISTS hmu_posts_post_type_check;
ALTER TABLE hmu_posts
  ADD CONSTRAINT hmu_posts_post_type_check
  CHECK (post_type IN ('driver_available','rider_request','direct_booking','blast'));

CREATE INDEX IF NOT EXISTS idx_hmu_posts_blast_active
  ON hmu_posts(market_id, status, scheduled_for)
  WHERE post_type = 'blast' AND status = 'active';
```

### 4.2 `blast_driver_targets` (audit + dedupe)

Tracks which drivers were notified for which blast.

```sql
CREATE TABLE blast_driver_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES hmu_posts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_score NUMERIC(6,3) NOT NULL,
  score_breakdown JSONB,                          -- audit: per-factor scores
  notified_at TIMESTAMPTZ DEFAULT NOW(),
  notification_channels TEXT[],                   -- ['push','sms']
  hmu_at TIMESTAMPTZ,                             -- driver tapped HMU
  hmu_counter_price NUMERIC(10,2),                -- if driver countered
  passed_at TIMESTAMPTZ,                          -- driver tapped Pass
  selected_at TIMESTAMPTZ,                        -- rider chose this driver
  rejected_at TIMESTAMPTZ,                        -- rider chose someone else
  UNIQUE(blast_id, driver_id)
);
CREATE INDEX idx_blast_driver_targets_blast ON blast_driver_targets(blast_id);
CREATE INDEX idx_blast_driver_targets_driver_active
  ON blast_driver_targets(driver_id, notified_at DESC);
```

### 4.3 Drafts — localStorage only

Cross-device resume is out of scope. Form state lives in `localStorage['blast_draft']` with 1hr TTL. After Clerk redirect-back, the form rehydrates from localStorage. No server-side `blast_drafts` table.

### 4.4 `driver_blast_preferences` (opt-in + quiet hours per driver)

Quiet hours currently live in `conversation_agent_config` (a different feature). Driver-side blast notification opt-in needs its own surface.

```sql
CREATE TABLE driver_blast_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blasts_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,                          -- e.g., '22:00'
  quiet_hours_end TIME,                            -- e.g., '07:00'
  max_blasts_per_day INTEGER DEFAULT 20,           -- driver self-throttle
  min_fare_threshold NUMERIC(10,2),                -- skip blasts under this
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Default row inserted on first driver activation; driver edits via `/driver/settings/blasts`.

### 4.5 `blast_rate_limits` (anti-abuse)

Cheap rate-limit table for unauth-IP and per-phone limits beyond what Upstash gives us.

```sql
CREATE TABLE blast_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_kind TEXT NOT NULL CHECK (identifier_kind IN ('phone','ip','user_id')),
  identifier_value TEXT NOT NULL,
  blast_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  window_end TIMESTAMPTZ NOT NULL,
  UNIQUE(identifier_kind, identifier_value, window_end)
);
CREATE INDEX idx_blast_rate_limits_lookup ON blast_rate_limits(identifier_kind, identifier_value);
```

Primary rate limiting still goes through Upstash; this table is the **persistent record** for admin abuse review.

---

## 5. API surface

All new rider-facing routes go under `app/api/blast/`. Clerk auth required except where noted.

**Drivers reuse existing ride-request endpoints** — see §5.3. No new driver-side routes.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/blast/estimate` | none | Body: `{pickup, dropoff}` → returns `{distance_mi, suggested_price, deposit_amount}`. Cached. |
| `POST` | `/api/blast` | required | Create blast from form payload. Idempotency key: `blast_${userId}_${formHash}`. Triggers matching, creates targets, fans out via existing notification path, creates PaymentIntent. |
| `GET` | `/api/blast/[id]` | required (rider only) | Live state including targets that have HMU'd. Ably-driven, polling fallback. |
| `POST` | `/api/blast/[id]/select/[targetId]` | required (rider only) | Lock the match. Idempotent. Creates `rides` row, holds deposit (deposit_only always), broadcasts loss to other targets. |
| `POST` | `/api/blast/[id]/bump` | required (rider only) | Body: `{additional_dollars}`. Increments price, expands radius, re-runs matching for new candidates only, re-broadcasts. |
| `POST` | `/api/blast/[id]/cancel` | required (rider only) | Voids deposit PaymentIntent, notifies targets via existing notification path. |

### 5.1 `POST /api/blast` — orchestration order

1. Validate Clerk auth.
2. Validate rider has photo uploaded (`users.video_intro_url IS NOT NULL` or equivalent). Reject with 412 if missing — frontend should never let user reach this state, but defense-in-depth.
3. Validate form: pickup/dropoff inside any active market polygon, scheduled_for ≥ now+5min.
4. Run rate-limit checks (Upstash + `blast_rate_limits` table).
5. Resolve market via `resolveMarketForUser()` → `lib/markets/resolver.ts`.
6. Run matching algorithm (§6) → eligible+scored driver list, capped at 10.
7. Apply 30-min same-driver dedupe: skip drivers already notified for a blast from this rider in the last 30min (`blast_driver_targets` lookup).
8. Create deposit PaymentIntent via `lib/payments/escrow.ts:holdRiderPayment()` with `mode: 'deposit_only'` (forced) and `capture_method: 'manual'`. Idempotency key: `auth_blast_${blastId}`.
9. Insert `hmu_posts` row (`post_type='blast'`, `status='active'`, `expires_at` per config).
10. Insert ≤10 `blast_driver_targets` rows.
11. Enqueue notification fanout — push via Ably `user:{driver_id}:notify`, SMS via voip.ms (respecting `driver_blast_preferences`, capped at 10 SMS sends per `MAX_SMS_PER_BLAST`).
12. Publish to `blast:{id}` Ably channel: `{event: 'blast_created', metadata}`.
13. Return `{blast_id, expires_at, targeted_count}`.

### 5.2 `POST /api/blast/[id]/select/[targetId]` — race handling

This is the only place where multiple drivers' actions race the rider's choice. Must be transactional:

```sql
BEGIN;
  -- atomic claim: only succeeds if blast still active
  UPDATE hmu_posts
     SET status = 'matched'
   WHERE id = $blastId AND status = 'active'
   RETURNING id;

  -- if 0 rows, blast was already taken/cancelled → 409 Conflict

  UPDATE blast_driver_targets
     SET selected_at = NOW()
   WHERE blast_id = $blastId AND id = $targetId;

  UPDATE blast_driver_targets
     SET rejected_at = NOW()
   WHERE blast_id = $blastId AND id != $targetId AND selected_at IS NULL;

  INSERT INTO rides (...) VALUES (...);
COMMIT;
```

After commit: capture or hold per `PricingStrategy.onMatch()`. Publish to `blast:{id}` (rider) and `user:{driver_id}:notify` for each loser.

### 5.3 Driver-side — reuse existing ride-request endpoints

Drivers do NOT see "blasts" as a distinct concept. A `hmu_posts` row with `post_type='blast'` arrives in the driver's existing ride-request inbox and uses existing endpoints:

| Driver action | Existing endpoint | Behavior for blast |
|---|---|---|
| Tap HMU on the request | `POST /api/bookings/[postId]/accept` | Same as today; additionally writes `blast_driver_targets.hmu_at` if a target row exists for this driver |
| Counter-price | `POST /api/bookings/[postId]/accept` with `counter_price` | Writes `blast_driver_targets.hmu_counter_price` |
| Pass | `POST /api/bookings/[postId]/decline` | Writes `blast_driver_targets.passed_at` |
| View open requests | existing driver inbox | Blast posts appear inline with `rider_request` posts; UI may add a small "blast" badge for analytics, but driver flow is identical |

The only code change on the driver side: the existing `accept`/`decline` handlers gain a small block that updates `blast_driver_targets` if the post is a blast. Everything else stays the same.

---

## 6. Matching algorithm (admin-configurable)

Stored as a single `platform_config` row, key = `blast_matching_v1`. Read with existing `getPlatformConfig()` helper.

### 6.1 Default config shape

```json
{
  "weights": {
    "proximity_to_pickup": 0.30,
    "recency_signin": 0.15,
    "sex_match": 0.15,
    "chill_score": 0.10,
    "advance_notice_fit": 0.10,
    "profile_view_count": 0.05,
    "completed_rides": 0.05,
    "low_recent_pass_rate": 0.10
  },
  "filters": {
    "max_distance_mi": 5.0,
    "min_chill_score": 50,
    "must_match_sex_preference": false,
    "must_be_signed_in_within_hours": 72,
    "exclude_if_in_active_ride": true,
    "exclude_if_today_passed_count_gte": 3
  },
  "limits": {
    "max_drivers_to_notify": 10,
    "min_drivers_to_notify": 3,
    "expand_radius_step_mi": 1.0,
    "expand_radius_max_mi": 15.0,
    "same_driver_dedupe_minutes": 30,
    "prioritize_hmu_first": false,
    "hmu_first_reserved_slots": 0
  },
  "expiry": {
    "default_blast_minutes": 15,
    "scheduled_blast_lead_minutes": 60
  },
  "deposit": {
    "default_amount_cents": 500,
    "percent_of_fare": 0.50,
    "max_deposit_cents": 5000
  },
  "default_price_dollars": 25,
  "price_per_mile_dollars": 2.00,
  "max_price_dollars": 200
}
```

### 6.2 Scoring (per driver)

Each factor normalized 0..1, multiplied by weight, summed:

| Factor | Normalization |
|---|---|
| `proximity_to_pickup` | `1 - (distance_mi / max_distance_mi)`, clamped 0..1 |
| `recency_signin` | `1 - (hours_since_signin / must_be_signed_in_within_hours)` |
| `sex_match` | 1 if matches rider preference or pref='any', else 0 |
| `chill_score` | `chill_score / 100` |
| `advance_notice_fit` | inverse of distance from driver's `notice_required` to actual lead time |
| `profile_view_count` | `min(views / 100, 1.0)` |
| `completed_rides` | `min(rides / 50, 1.0)` |
| `low_recent_pass_rate` | `1 - (passes_last_24h / 10)` |

After scoring, **sort desc**, **filter** by absolute thresholds, **cap** to `max_drivers_to_notify` (default 10). If fewer than `min_drivers_to_notify` qualify, expand radius by `expand_radius_step_mi` and retry until `expand_radius_max_mi`.

**Same-driver dedupe**: drivers already notified for any blast from this rider in the last `same_driver_dedupe_minutes` (default 30) are excluded from the candidate pool before scoring. Prevents notification fatigue when a rider re-blasts after no match.

**HMU First prioritization (Phase 2 lever, off by default)**: when `prioritize_hmu_first: true`, reserve `hmu_first_reserved_slots` of the 10-slot fanout for HMU First drivers exclusively. Remaining slots fill from the global sorted list. Activate this once organic blast volume creates competition pressure that justifies the perk.

Persist `score_breakdown` per target row for admin debugging and post-launch tuning.

### 6.3 Per-market overrides

Same shape, key `blast_matching_v1:market:{slug}`. Reader merges market-specific over global defaults.

---

## 7. Admin pages

All new admin pages must register a permission slug in `lib/admin/route-permissions.ts` per [[feedback_admin_pages_require_rbac_slug]].

### 7.1 `/admin/blast-config`

**Permission slug**: `grow.blast_config` (under GROW section).

Tabs:
- **Matching algorithm** — live JSON editor for `blast_matching_v1`, with per-market override picker. Validates against schema before save. Shows "what would have matched" preview against the last 50 blasts.
- **Pricing defaults** — `default_price_dollars`, `price_per_mile_dollars`, `max_price_dollars`, deposit settings.
- **Timing** — countdown defaults, scheduled lead times, draft TTL.
- **Notification policy** — global SMS-on/off kill switch, max SMS per driver per day (cost control), opt-in default.

### 7.2 `/admin/blasts`

**Permission slug**: `monitor.blasts` (under MONITOR section).

Live table of recent blasts (filterable by market via `useMarket()`). Columns: rider, market, pickup→dropoff, price, # targets, # HMU'd, outcome, time-to-match. Click row → drawer with full target list + per-driver score breakdown (the "why was this driver picked" debugger).

### 7.3 `/admin/blast-rate-limits`

**Permission slug**: `monitor.abuse` (or extend existing safety route).

View persistent rate-limit hits + manual "release this phone" button.

### 7.4 Existing pages to extend

- `/admin/onboarding-config` — add a "Blast funnel minimum fields" toggle on `rider-profile-fields-panel.tsx`. Marks which fields block the blast funnel vs which can defer.
- `/admin/feature-flags` — add `blast_booking` flag (rollout via existing `isFeatureEnabled()`).
- `/admin/markets` — add `blast_enabled BOOLEAN` per market so we can dark-launch ATL only.

---

## 8. SMS via voip.ms

Use existing `lib/sms/textbee.ts:sendSms()` (function name is misleading — it's voip.ms per [[sms_provider_actual]]). Don't introduce a new SMS path.

### 8.1 Per-driver gate (must hit ALL before sending)

```typescript
function shouldSendBlastSms(driver, blast): boolean {
  const prefs = await getDriverBlastPreferences(driver.user_id);
  if (!prefs.blasts_enabled || !prefs.sms_enabled) return false;
  if (isInQuietHours(prefs, driver.timezone, new Date())) return false;
  if (await smsCountToday(driver.user_id) >= prefs.max_blasts_per_day) return false;
  if (prefs.min_fare_threshold && blast.price < prefs.min_fare_threshold) return false;
  return true;
}
```

### 8.2 Global gate

`platform_config['blast_sms_kill_switch']` — if true, skip ALL SMS (push only). Cost guard for runaway notifications.

### 8.3 Message body

Single market voice per [[feedback_no_timezone_in_user_facing_strings]] — no timezone abbreviations.

```
HMU ride request — $25, pickup West End in 20 min.
Tap to view: https://atl.hmucashride.com/d/b/{shortcode}
Reply STOP to opt out.
```

Shortcode resolves via `app/d/b/[code]/route.ts` → 302 to signed `/driver/blasts/[id]` URL. Lets us track click-through and gives drivers a reason to keep the app installed.

### 8.4 Cost ceiling

Worker config: `MAX_SMS_PER_BLAST` (env var, default 8) — hard ceiling regardless of matching algorithm output. Sentry alert when 80% of any driver's daily SMS cap is hit.

### 8.5 Logging

Every send writes to existing `sms_log` table with `kind='blast_notification'` and `blast_id` in metadata. Admin can pull cost/volume reports from this.

### 8.6 STOP keyword handling

voip.ms inbound webhook (existing handler) — on receipt of "STOP" from a number, set `driver_blast_preferences.sms_enabled = false` for that user. Confirmation reply: *"OK, no more HMU ride alerts. Reply START to re-enable."*

---

## 9. Anti-abuse

| Layer | Mechanism | Limit |
|---|---|---|
| Pre-auth | Upstash rate limit on `POST /api/blast/draft` | 10 / IP / hour |
| Pre-auth | Upstash rate limit on `POST /api/blast/estimate` | 30 / IP / hour |
| Auth required | Phone-verified Clerk user | always |
| Blast send | Upstash + `blast_rate_limits` table | 5 blasts / phone / hour, 20 / day |
| Blast send | Deposit PaymentIntent must succeed | always |
| Blast send | Pickup/dropoff inside active market polygon | always |
| Blast send | Card not flagged in Stripe Radar | always |
| Cost guard | `MAX_SMS_PER_BLAST` env var | 8 |
| Cost guard | `blast_sms_kill_switch` admin toggle | runtime |
| Driver-side | `max_blasts_per_day` per driver | 20 default |
| Pattern detection | Cron checks for >3 cancels-without-match per phone in 7d → flag for admin review | daily |

---

## 10. Ably channels

| Channel | Subscribers | Events |
|---|---|---|
| `blast:{id}` | rider | `target_hmu`, `target_pass`, `match_locked`, `expired`, `bumped`, `cancelled` |
| `user:{driver_id}:notify` | individual driver | `blast_invite`, `blast_taken`, `blast_cancelled` |
| `market:{slug}:blasts` | admin dashboard, optional driver "live blast feed" page | `blast_created`, `blast_completed` |
| `admin:feed` | admin | `blast_abuse_flag`, `blast_no_match` |

Token issuance via existing `app/api/tools/ably/token` route. Token scope per role enforced server-side before issuance.

---

## 11. Feature flag rollout

Per [[feature_flag_delivery_pattern]] — ship code dormant.

Flags:
- `blast_booking` — master switch for the route. When false, `/rider/browse/blast` 404s.
- `blast_sms_enabled` — independent toggle for SMS layer.
- `blast_admin_dashboards` — independent toggle for admin pages (so they can ship before rider-facing route).

Rollout plan:
1. Code deploys with all flags off.
2. Admin pages enabled in prod for super admins only.
3. Internal blast on staging end-to-end.
4. Enable for ATL market only (`markets.blast_enabled = true`).
5. 10% rollout via `feature_flags.rollout_percentage` for 48h.
6. 100% if metrics hold (see §13).

---

## 12. PricingStrategy integration

Per [[deposit_only_launch_model]], all money decisions go through `PricingStrategy`. Blast is no exception:

```typescript
// At /api/blast — strategy decides what we authorize
const strategy = await getPricingStrategyForUser(rider);
const { holdAmountCents, mode } = strategy.calculateHold({
  fareCents: blastPriceCents,
  context: 'blast',
});

// At /api/blast/[id]/select/[targetId] — strategy decides capture-now or hold-until-pull-up
strategy.onMatch({ rideId, holdPaymentIntentId });
```

**No** new payment paths. If strategy is `deposit_only`, a $5 hold; if `legacy_full_fare`, a 50% hold of total fare; both already implemented in `lib/payments/escrow.ts`.

---

## 13. Acceptance criteria & launch metrics

### 13.1 Functional acceptance

- [ ] Unauth rider can complete the form, see pricing estimate, hit Send → routed to Clerk
- [ ] localStorage draft survives auth round-trip
- [ ] Server-side draft survives cross-device auth
- [ ] On send, deposit PaymentIntent created; failure rolls back blast creation
- [ ] Matching produces ≥ `min_drivers_to_notify` drivers OR widens radius
- [ ] Push + SMS fanout respects all per-driver and global gates
- [ ] Driver HMU appears in rider's offer board within 2s of tap (Ably-driven, not poll)
- [ ] Race condition test: 3 drivers HMU, rider taps Match on driver A — drivers B and C see "ride taken" within 2s
- [ ] Match → ride created → normal Pull Up flow at `/ride/[id]`
- [ ] No-match expiry → fallback modal with bump / reschedule / cancel-refund
- [ ] All admin config changes take effect within 60s (cache TTL)
- [ ] STOP from a driver's phone disables their SMS opt-in within 1 webhook cycle

### 13.2 Conversion metrics (PostHog dashboards)

- `blast_form_started` → `blast_form_submitted`: target ≥ 60%
- `blast_form_submitted` → `blast_authed`: target ≥ 70%
- `blast_authed` → `blast_deposit_succeeded`: target ≥ 85%
- `blast_created` → `blast_matched`: target ≥ 75% within 15 min
- `blast_matched` → `ride_started`: target ≥ 90%
- End-to-end `blast_form_started` → `ride_started`: target ≥ 25%

### 13.3 Cost/abuse metrics

- SMS cost per blast (target < $0.05 avg)
- Blasts per phone per day (alert at p95 > 5)
- Driver SMS opt-out rate (alert at > 2% / week)
- Refund rate on no-match (target < 15%)

---

## 14. Microanimation inventory

Premium feel comes from a small number of consistent motions. Reuse, don't invent.

| Surface | Motion | Reuse from |
|---|---|---|
| "Find a Ride" CTA | 1.2s opacity pulse | new — Tailwind `animate-pulse` retuned |
| Form block expand | 200ms ease-out, height + opacity | shadcn Accordion |
| Pricing estimate update | 150ms count-up animation on the dollar amount | new — light JS lerp |
| Send button → loading | spinner morph in 300ms | shadcn Button with state |
| Driver card glide-in on offer board | 250ms ease-out, translateX +24px → 0, opacity 0→1, staggered 80ms per card | commit `10c1ed6` driver-home pattern |
| Countdown bar | smooth requestAnimationFrame width transition | new |
| Match button → success | spinner → checkmark morph, 800ms, then redirect | shadcn Button |
| Cancel/expired | card fade + collapse 250ms | new |

All motion respects `prefers-reduced-motion: reduce` — disables transforms, keeps opacity changes only.

---

## 15. Open questions

### Resolved 2026-05-12
1. ✅ **Deposit timing** — deposit-only for ALL blasts, regardless of cohort
2. ✅ **Counter-price UX** — explicit display ("you offered $25 → driver counters $30"), rider accepts or skips
3. ✅ **Same-driver dedupe** — 30min window
6. ✅ **Driver blast inbox** — none. Reuse existing ride-request inbox; drivers don't know "blast" as a concept
8. ✅ **Photo** — required, gated after profile creation, before deposit

### Still open (non-blocking — defaults applied)
4. **Ride history attribution.** Should `/rider/rides` show blasts that didn't match? Default: yes, with a "Did not match" status. Confirm before frontend build.
5. **`hmu_posts.areas` backfill.** Default: derive area names from lat/lng via reverse geocoding on insert, populate `areas` for backwards compat with existing feed queries. Confirm before migration runs in prod.
7. **Multi-market drivers.** A driver active in two markets — do we notify on blasts in both? Default: yes, gated by `driver_blast_preferences` not by market.

---

## 16. Out of scope (Phase 2+)

- **Cross-device draft recovery** — auth on a different device than form was started on; localStorage only
- **Browser-bounce recovery** — "pick up where you left off" prompt for expired drafts
- **Recurring blasts** ("every Tuesday at 5pm")
- **Group blasts** (multiple riders, single driver, shared ride) — covered by separate spec
- **Driver blast subscription tier** (pay $X/mo for higher placement in matching)
- **HMU First fanout prioritization** — config field exists but defaults off; activate when volume warrants
- **Voice-to-blast** (rider says "I need a ride to Decatur in an hour" → parsed)
- **SMS-initiated blast** (rider texts a number → app provisions an account)
- **Multi-stop in blast form** (use existing `stops` JSONB, but UI deferred)
- **Dedicated `/driver/blasts` inbox** — drivers use existing ride-request inbox
