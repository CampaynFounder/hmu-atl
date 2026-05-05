# Recurring Rides — Feature Spec

> **Status:** DRAFT — pending feedback from founder before implementation.
> **Created:** 2026-05-03
> **Owner:** TBD (likely new agent: `08b-recurring-rides`)
> **Depends on:** existing one-time ride flow (`hmu_posts` + `ride_interests` + `/api/bookings/[postId]/select`), `lib/payments/escrow.ts`, ride state machine in `lib/rides/state-machine.ts`.

---

## 1. Goal

Let riders post a **recurring ride agreement** (daily or weekly) describing pickup/dropoff areas, time(s) of day, target price, sex preference, seat count, and one-way vs. round-trip. Drivers in matching areas get notified, can accept at the rider's price or counter. Rider reviews accepted drivers and selects one. The selection commits the chosen driver to the full series. Other drivers are auto-declined.

Each scheduled occurrence then runs through the existing one-time ride lifecycle (OTW → HERE → ACTIVE → ENDED → captured) using the same payment, dispute, no-show, and late-arrival logic — applied per instance.

---

## 2. Decisions made

| Area | Decision |
|---|---|
| Recurrence frequency | **Daily or weekly only.** No monthly, no "first Tuesday," no RFC 5545. |
| Schema model | **Two-level**: `ride_series` (the agreement) → `ride_series_occurrences` (templates per day-shape) → spawned `rides` rows (existing table). |
| Driver matching | **Reuse `hmu_posts` + `ride_interests`** with a new post type. Multi-driver aggregation + rider selection — already the live one-time pattern. |
| Driver offer pricing | **Per occurrence**, not per series. `ride_series_offers.prices` is jsonb keyed by occurrence_id. |
| Driver commitment | **All occurrences by default**, with one-tap "skip this week" per occurrence. Drivers do not pick which occurrences to commit to upfront. |
| Mileage | **Mapbox Directions API** (real driving distance), computed once at series creation per occurrence, cached on `ride_series_occurrences.total_miles` and `.estimated_minutes`. Actual mileage per spawned ride aggregated from `ride_locations` GPS stream on completion. |
| Payment hold | **Per instance**, T-12h before pickup. Series-level pre-auth not attempted (Stripe holds expire in 7 days). |
| Payment failure | **2 consecutive failures → series auto-paused.** Single failure = skip that instance, notify rider, series continues. |
| Capture | At **ride start**, identical to one-time flow. |
| Application fee | Existing progressive tier logic, applied per instance. No series-level fee. |
| Series cancellation | **Free anytime** for either party at series level. Per-occurrence cancel uses existing one-time cancel rules (free >24h out, normal rules inside 24h). |
| No-show on series | **2 rider no-shows in same series → driver can release series, no penalty.** Each individual no-show charges existing pulloff fees. |
| Driver late on series | **3 lates >10min on same series → rider one-tap boots driver, series re-opens for offers, no fee to rider.** |
| Admin RBAC | **Reuse `act.rides`** permission slug. No new slug. |

---

## 3. Decisions PENDING founder review

These three were proposed but not explicitly confirmed. Default proposal listed; if you push back, schema changes accordingly.

| # | Question | Default proposal | Why |
|---|---|---|---|
| P1 | Driver commitment shape | All-by-default + one-tap skip per occurrence | Simpler model; matches "my Tuesday driver" mental model |
| P2 | Series end condition | `end_date` (calendar) OR open-ended (rider cancels anytime). **Drop `occurrence_count`.** | Subscription-style mental model; one fewer field for rider to fill |
| P3 | Mid-series schedule edits | **Locked at creation for v1.** Adding/removing occurrences ends the series and starts a new one (re-bid by driver) | Prevents driver-pricing-fairness problem when rider changes shape after offer accepted |

---

## 4. Schema

### 4.1 `ride_series`
```sql
CREATE TABLE ride_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES users(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES users(id),                         -- nullable until selected
  hmu_post_id UUID REFERENCES hmu_posts(id),                   -- the post that spawned this series
  market_id UUID REFERENCES markets(id),
  status TEXT CHECK (status IN (
    'open_for_offers',   -- collecting driver offers
    'active',            -- driver selected, occurrences spawning
    'paused',            -- payment failures, admin intervention, or rider pause
    'ended',             -- end_date hit or cancelled
    'cancelled'          -- terminal
  )) NOT NULL DEFAULT 'open_for_offers',
  frequency TEXT CHECK (frequency IN ('daily', 'weekly')) NOT NULL,
  days_of_week INTEGER[] NOT NULL,                             -- [1..7], Mon=1, Sun=7
  start_date DATE NOT NULL,
  end_date DATE,                                               -- nullable = open-ended
  driver_preference TEXT CHECK (driver_preference IN ('male','female','any')) DEFAULT 'any',
  seats INTEGER DEFAULT 1 CHECK (seats BETWEEN 1 AND 6),
  total_miles_per_week NUMERIC(10,2),                          -- cached: Σ occurrence miles × matching days
  consecutive_payment_failures INTEGER DEFAULT 0,
  rider_no_show_count INTEGER DEFAULT 0,
  driver_late_count INTEGER DEFAULT 0,
  selected_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (cardinality(days_of_week) > 0),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_ride_series_status ON ride_series(status);
CREATE INDEX idx_ride_series_driver ON ride_series(driver_id) WHERE status = 'active';
CREATE INDEX idx_ride_series_rider ON ride_series(rider_id);
```

### 4.2 `ride_series_occurrences`
```sql
CREATE TABLE ride_series_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID REFERENCES ride_series(id) ON DELETE CASCADE,
  label TEXT,                                                  -- "morning" / "evening" / free text, optional
  time_of_day TIME NOT NULL,                                   -- pickup time, local to market
  days_of_week_subset INTEGER[],                               -- nullable = all series days; otherwise must be subset
  waypoints JSONB NOT NULL,                                    -- ordered array (see waypoint shape below)
  total_miles NUMERIC(10,2) NOT NULL,                          -- from Mapbox at creation
  estimated_minutes INTEGER NOT NULL,                          -- from Mapbox at creation
  price_per_instance NUMERIC(10,2),                            -- final agreed price per instance for this occurrence
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (jsonb_array_length(waypoints) BETWEEN 2 AND 5)        -- pickup + 0-3 stops + dropoff
);
CREATE INDEX idx_ride_series_occurrences_series ON ride_series_occurrences(series_id);
```

**Waypoint shape (jsonb element):**
```json
{
  "lat": 33.7490,
  "lng": -84.3880,
  "address": "100 Peachtree St NE, Atlanta GA",
  "action": "pickup" | "stop" | "dropoff",
  "wait_minutes": 30  // optional, for round-trip-with-wait
}
```

Rules:
- First waypoint MUST be `action: 'pickup'`, last MUST be `action: 'dropoff'`.
- For round-trip-with-wait (A→B→A), use 3 waypoints: pickup A, stop B (with `wait_minutes`), dropoff A.

### 4.3 `ride_series_offers`
```sql
CREATE TABLE ride_series_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID REFERENCES ride_series(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending','selected','declined','withdrawn','expired')) DEFAULT 'pending',
  prices JSONB NOT NULL,                                       -- { occurrence_id: price_per_instance }
  weekly_total NUMERIC(10,2) NOT NULL,                         -- denormalized for sorting/display
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  selected_at TIMESTAMPTZ,
  UNIQUE (series_id, driver_id)
);
CREATE INDEX idx_ride_series_offers_series ON ride_series_offers(series_id, status);
```

### 4.4 `rides` table — additions
```sql
ALTER TABLE rides ADD COLUMN series_id UUID REFERENCES ride_series(id);
ALTER TABLE rides ADD COLUMN series_occurrence_id UUID REFERENCES ride_series_occurrences(id);
ALTER TABLE rides ADD COLUMN scheduled_for TIMESTAMPTZ;        -- the planned pickup datetime for this instance
ALTER TABLE rides ADD COLUMN payment_failed BOOLEAN DEFAULT FALSE;
ALTER TABLE rides ADD COLUMN skipped_at TIMESTAMPTZ;           -- if rider/driver/admin skipped this instance
ALTER TABLE rides ADD COLUMN skipped_by TEXT CHECK (skipped_by IN ('rider','driver','admin','system'));
CREATE INDEX idx_rides_series_id ON rides(series_id) WHERE series_id IS NOT NULL;
CREATE INDEX idx_rides_scheduled_for ON rides(scheduled_for) WHERE scheduled_for IS NOT NULL;
```

### 4.5 `hmu_posts` table — additions
```sql
ALTER TABLE hmu_posts ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;
ALTER TABLE hmu_posts ADD COLUMN ride_series_id UUID REFERENCES ride_series(id);
-- post_type stays the same ('rider_request'); is_recurring discriminates downstream
```

---

## 5. Flexibility — pattern coverage

All of these are supportable with no schema changes:

| Pattern | Series rows | Occurrence rows | Notes |
|---|---|---|---|
| A→B daily one-way | 1 | 1 | 2 waypoints |
| Morning A→B→A round trip with wait | 1 | 1 | 3 waypoints, middle has `wait_minutes` |
| Morning A→B + evening B→A | 1 | **2** | Two separate ride instances/day |
| Morning round trip + evening round trip | 1 | **2** | 3 waypoints each |
| M/W/F morning round trip + T/Th evening one-way | 1 | **2** | First occ `days_of_week_subset=[1,3,5]`, second `[2,4]` |
| School run (home → school A → school B → home) | 1 | 1 | 4 waypoints |

### Hard limits (enforce in API + schema)
- Max 4 occurrences/day per series
- Max 5 waypoints per occurrence (pickup + 3 stops + dropoff)
- Min 60min gap between same-day occurrences (occ 1 ends → occ 2 starts)
- Max series length: 12 weeks (renewable, not infinite)
- `days_of_week` non-empty
- Rider must have a saved Stripe payment method to create a series

---

## 6. Flow

### 6.1 Series creation (rider)

1. Rider opens "Recurring ride" form (new entry point on `/rider/post`).
2. Rider provides:
   - Frequency (`daily` | `weekly`)
   - Days of week (multi-select)
   - Start date, optional end date (open-ended if blank)
   - For each occurrence (1–4): label, time, waypoints (with optional wait_minutes on stops)
   - Driver sex preference
   - Seats needed
   - Target price per occurrence (rider's proposal)
3. Server:
   - Validates limits (above)
   - Calls Mapbox Directions per occurrence → caches `total_miles`, `estimated_minutes`
   - Creates `ride_series` (status `open_for_offers`) + `ride_series_occurrences`
   - Creates `hmu_posts` row (`is_recurring=true`, `ride_series_id` set) so existing driver feed picks it up
   - Publishes Ably event on `area:{slug}:feed` for matching drivers
4. PostHog event: `series_created`.

### 6.2 Driver discovery + offer

1. Driver sees recurring posts in existing `/driver/requests` feed, badged differently from one-time. Filtered by area-match.
2. Driver opens series detail: weekly schedule, all occurrences with mileage/duration, target price, expected weekly total.
3. Driver submits offer via new `POST /api/series/[id]/offer` — body includes per-occurrence prices and optional notes.
4. Server creates `ride_series_offers` row (status `pending`), notifies rider via Ably + push.
5. Driver may withdraw before selection: `DELETE /api/series/[id]/offer` → status `withdrawn`.

### 6.3 Rider selection

1. Rider sees offers ranked by weekly total + driver's chill_score, completed_rides, tier.
2. `POST /api/series/[id]/select` with `offerId`:
   - Selected offer → `selected`, all others → `declined`, withdrawn excluded
   - `ride_series.status = 'active'`, `driver_id` set, `selected_at` timestamped
   - Per-occurrence `price_per_instance` written from selected offer's `prices` jsonb
   - All declined drivers get `interest_passed`-style push
   - `hmu_post.status = 'matched'`
   - First spawn cycle scheduled (see 6.4)
3. PostHog: `series_started`.

### 6.4 Instance spawning (cron, T-24h)

GitHub Actions cron job runs every 5min (existing pattern from `cron_via_github_actions.md`):

1. Find active series where `next_occurrence_at <= NOW() + 24h` and instance not yet spawned.
2. For each `(date, occurrence)` pair where `date.dayOfWeek ∈ series.days_of_week ∩ occurrence.days_of_week_subset`:
   - Insert `rides` row with status `'matched'`, `series_id`, `series_occurrence_id`, `scheduled_for`, populated pickup/dropoff/stops from waypoints, `amount = occurrence.price_per_instance`
   - Notify rider + driver: "Your recurring ride is scheduled for [date] at [time]."
3. PostHog: `series_instance_spawned`.

### 6.5 Per-instance payment (T-12h)

A second cron pass at T-12h:
1. For instances where hold not yet placed:
   - Call `holdRiderPayment()` (existing) on the rider's saved payment method
2. On success → `payment_failed = false`, store `payment_intent_id` on ride row
3. On failure:
   - Set `rides.payment_failed = true`, `rides.skipped_at = NOW()`, `rides.skipped_by = 'system'`
   - Increment `ride_series.consecutive_payment_failures`
   - Push rider: "Couldn't charge your card for tomorrow's ride. Update your payment method."
   - If `consecutive_payment_failures >= 2` → `ride_series.status = 'paused'`, push driver + admin alert
4. On any successful subsequent capture → reset `consecutive_payment_failures = 0`

### 6.6 Ride lifecycle (per instance)

**Identical to existing one-time flow.** `lib/rides/state-machine.ts` unchanged. Routes used unchanged: `/otw`, `/here`, `/start`, `/end`, `/cancel`, `/pulloff`, `/dispute`. Capture happens at `/start`. Application fee calculated at capture time per existing progressive logic.

### 6.7 Cancellation rules

| Action | Effect | Refund logic |
|---|---|---|
| Rider skips next occurrence (>24h out) | `rides.skipped_by='rider'`, free | Hold not yet placed, nothing to refund |
| Rider skips next occurrence (<24h out, hold placed) | Existing one-time cancel rules apply | Existing |
| Rider cancels series | `ride_series.status='cancelled'`, all future un-spawned instances skipped, any held funds on the next 24h instance follow per-occurrence cancel rules | Existing per-instance |
| Driver skips next occurrence | Counts toward `driver_late_count`-equivalent reliability score | Per-instance refund if hold placed |
| Driver cancels series mid-run | `ride_series.status='open_for_offers'`, `driver_id=NULL`, push rider "Driver dropped — pick a new one." Other drivers' previously-declined offers do **not** auto-revive — rider gets fresh offers | Refund any held funds for upcoming instance |
| Rider no-show (per instance) | Existing pulloff fee (25%/50% by tier), `rider_no_show_count++` | Existing |
| 2nd rider no-show in same series | Driver gets one-tap "release series" button, no penalty to driver | Series goes to `open_for_offers` (rider can re-shop or let it die) |
| Driver late >10min (per instance) | `driver_late_count++` | None at instance level |
| 3rd driver late in same series | Rider gets one-tap "boot driver" button. `ride_series.driver_id=NULL`, `status='open_for_offers'`, no fee | Refund any pending hold |

### 6.8 Series end

- `end_date` reached: nightly job sets `status='ended'`, `ended_at=NOW()`. No more spawning.
- Open-ended: lives until either party cancels.
- Auto-end if `consecutive_payment_failures >= 2` and rider doesn't update payment method within 7 days of pause.

---

## 7. Admin portal

### 7.1 Extend existing pages
- **`/admin/ride-requests`** — add "Recurring" tab. Columns: rider, frequency, occurrences/week, weekly total, instances completed/total, health (% no-shows, % payment_failed), status. Click → series detail.
- **`/admin/disputes`** — add `series_id` link on dispute rows. Show "X prior instances completed clean" as context.
- **`/admin/safety`** — new alert types in queue:
  - `series_driver_dropped`
  - `series_repeat_no_show`
  - `series_repeat_late`
  - `series_payment_failed`
- **`/admin/money`** — "Recurring MRR" tile:
  ```
  Σ (occurrence.price_per_instance × |days_of_week ∩ subset| × 4.33)
  ```
  Plus weekly churn (series ended this week / active series).
- **`/admin/users`** — on user detail: "Active series: N (M as rider, K as driver)" with click-through.
- **`/admin/feature-flags`** — gate `recurring_rides_enabled` per market.
- **`/admin`** (Live Ops) — "Spawner status" widget: last cron run, instances spawned, failures.
- **`/admin/suspect-usage`** — new patterns:
  - Same rider creates ≥3 series and cancels each before instance 1 (fraud / payment-method probing)
  - Driver accepts series, completes instance 1, ghosts ≥2 subsequent instances
  - Cash-marked recurring series ≥3 between same pair (off-platform funnel signal)

### 7.2 New page
- **`/admin/ride-requests/series/[id]`** — series detail:
  - Header: parties, status, frequency, schedule, dates, weekly total
  - Occurrences (cards): each with waypoints, mileage, est. duration, per-instance price, count completed/skipped/failed
  - Timeline: every spawned `rides` row with state, payment status, who-skipped-if-skipped
  - Driver reliability for this series specifically
  - Intervention buttons:
    - **Pause series** — no spawning until resumed
    - **Force-skip a specific (date, occurrence)** — useful for holidays
    - **Re-open for offers** — bumps to `open_for_offers` without driver penalty
    - **Cancel + refund pending holds** — terminal
    - **Manually trigger spawn** — debug-only
    - **Override next-instance price** — one-time adjustment

### 7.3 RBAC
- Reuse `act.rides` permission slug.
- Add to `lib/admin/route-permissions.ts`:
  ```ts
  { pattern: '/admin/ride-requests/series', rule: { kind: 'permission', slug: 'act.rides' } }
  ```

---

## 8. APIs

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/series` | Create series (rider) |
| GET | `/api/series/[id]` | Get series detail (rider/driver, scoped) |
| POST | `/api/series/[id]/offer` | Driver submits offer |
| DELETE | `/api/series/[id]/offer` | Driver withdraws offer |
| GET | `/api/series/[id]/offers` | Rider lists offers |
| POST | `/api/series/[id]/select` | Rider selects offer |
| POST | `/api/series/[id]/cancel` | Either party cancels series |
| POST | `/api/series/[id]/pause` | Rider pauses (admin can also) |
| POST | `/api/series/[id]/resume` | Resume paused series |
| POST | `/api/series/[id]/skip-instance` | Skip a specific (date, occurrence) |
| POST | `/api/series/[id]/release` | Driver releases series after rider's 2nd no-show |
| POST | `/api/series/[id]/boot-driver` | Rider boots driver after 3rd late |
| POST | `/api/admin/series/[id]/intervene` | Admin force-action (override price, manual spawn, etc.) |

All routes require Clerk auth + Upstash rate limiting + PostHog event.

---

## 9. Reuse map

What this feature reuses without modification:
- `hmu_posts` flow (with `is_recurring` flag)
- `ride_interests` pattern (NOT used directly — new `ride_series_offers` table — but same selection paradigm)
- `holdRiderPayment` / `captureRiderPayment` from `lib/payments/escrow.ts`
- Ride state machine (`lib/rides/state-machine.ts`)
- All `/api/rides/[id]/*` endpoints (otw, here, start, end, cancel, pulloff, dispute)
- `ride_locations` GPS stream
- Ably channels: `ride:{ride_id}`, `user:{user_id}:notify`, `area:{slug}:feed`
- PostHog event scaffolding
- Upstash rate limiting middleware
- GitHub Actions cron pattern

What's net new:
- `ride_series`, `ride_series_occurrences`, `ride_series_offers` tables
- `rides` column additions (above)
- `hmu_posts` column additions (above)
- ~12 new API routes (above)
- Spawner cron job (24h scheduling pass + 12h payment-hold pass)
- Mapbox Directions integration for mileage caching
- Series detail page + admin extensions
- Reliability counters + auto-pause/release/boot logic

---

## 10. Out of scope for v1

- Monthly recurrence
- "First Tuesday of the month" calendar rules
- Series cloning ("repeat this series for another 12 weeks")
- Mid-series schedule edits (per Decision P3)
- Per-occurrence driver assignment (one driver = whole series)
- Recurring service bookings (post-MVP per CLAUDE.md)
- Recurring delivery (post-MVP per CLAUDE.md)
- Driver-initiated recurring offers ("I drive Tue/Thu mornings, anyone want to book?") — Phase 2
- SMS-based series creation — Phase 2
- Auto-renewal at end_date — Phase 2

---

## 11. Implementation phases

### Phase 0 — schema + admin scaffolding (Schema Agent)
- Migration: 3 new tables, `rides` + `hmu_posts` ALTERs
- TypeScript types in `lib/db/types.ts`
- Feature flag `recurring_rides_enabled` per market
- Admin route-permissions entry

### Phase 1 — series creation + offer flow (no spawning yet)
- `POST /api/series`, GET routes
- Mapbox Directions integration
- Rider series-creation UI on `/rider/post`
- Driver offer UI in `/driver/requests` feed
- `POST /api/series/[id]/offer`, `/select`
- Admin `/admin/ride-requests` "Recurring" tab + series detail page
- Manual spawn button on admin (lets you test instance creation without waiting for cron)

### Phase 2 — automated spawning + per-instance payment
- T-24h spawner cron job
- T-12h payment-hold cron job
- Payment failure handling + auto-pause
- Spawner status widget on `/admin`

### Phase 3 — reliability + intervention
- `release` / `boot-driver` user actions
- Admin intervention buttons
- `/admin/safety` new alert types
- `/admin/suspect-usage` new pattern detectors

### Phase 4 — observability + analytics
- `/admin/money` Recurring MRR tile
- PostHog funnel: created → first offer → selected → first instance completed → 4-week retention
- Per-series health dashboard

---

## 12. Key risks

1. **Payment-method churn.** Cards expire mid-series. Mitigation: 7-day grace + nudges before auto-pause.
2. **Driver life-event drop-off.** Mitigation: easy series-cancel for driver, rider goes back to `open_for_offers` quickly.
3. **Mapbox cost on series creation spike.** Mitigation: cache aggressively, no per-spawn calls.
4. **Cron silent failure.** Mitigation: spawner status widget on admin home, alerting if last-run > 30min ago.
5. **Edge case: DST shift on `time_of_day`.** Store as TIME, render in market timezone — but per `feedback_no_timezone_in_user_facing_strings.md`, never show timezone strings to users. Spawner does the conversion silently.

---

## 13. Founder review checklist

Please respond to each before implementation begins:

- [ ] Decisions P1–P3 in §3 — confirm or push back
- [ ] Hard limits in §5 — comfortable, or want different bounds?
- [ ] No-show / late thresholds (2 / 3) in §6.7 — right numbers?
- [ ] Auto-pause after 2 consecutive payment failures (§6.5) — right number?
- [ ] 12-week max series length (§5) — right cap?
- [ ] Open-ended series allowed (P2 default) — yes/no?
- [ ] Reuse `act.rides` RBAC (§7.3) — vs. new `act.series` slug?
- [ ] Phase ordering in §11 — want anything resequenced?
