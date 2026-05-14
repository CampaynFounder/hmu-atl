# Blast v3 — Agent Contract

> **Status:** v3 spec, locked 2026-05-14, owner founder@kikbac.ai
> **Scope:** binding contract for the parallel rebuild of the blast booking feature.
> **How to use this doc:** read §1–§3 to orient. Find your stream in §4 — that table tells you which files you own and which contracts (§7–§10) you must conform to. Don't touch files you don't own.

---

## 1. What this doc is (and isn't)

This is the coordination contract for ~5 parallel agents rebuilding the Blast feature in git worktrees. It exists so the streams don't drift on visuals, types, endpoints, or shared components.

**This doc is binding for:**
- File ownership boundaries (§4)
- Shared TypeScript types & endpoint shapes (§7, §8)
- Event log schema (§9)
- Shared components built once in Gate 2 (§6)
- Definition of Done per stream (§11)
- v3 product deltas from v2 (§3)

**This doc is NOT:**
- A rewrite of the brand system → see [`BRAND_GUIDE.md`](./BRAND_GUIDE.md), the source of truth for colors, type, glow, radius, copy voice
- A rewrite of the v2 spec → see [`BLAST-BOOKING-SPEC.md`](./BLAST-BOOKING-SPEC.md) for the historical spec, which is mostly still correct except where §3 below overrides it
- A rewrite of project rules → see [`CLAUDE.md`](../CLAUDE.md) (deploy workflow, schema agent ownership, MCPs)
- A rewrite of payments / ride flow → see [`PAYMENTS.md`](./PAYMENTS.md), [`RIDE-FLOW.md`](./RIDE-FLOW.md)

When in doubt, **the order of authority is**: this doc (for coordination) → BRAND_GUIDE.md (for visuals) → CLAUDE.md (for project rules) → BLAST-BOOKING-SPEC.md (for product context).

---

## 2. Required reading before starting work

Every stream agent reads, in this order:
1. This doc (full)
2. [`BRAND_GUIDE.md`](./BRAND_GUIDE.md) — color, type, glow, radius
3. The relevant section of [`BLAST-BOOKING-SPEC.md`](./BLAST-BOOKING-SPEC.md) for product context
4. [`CLAUDE.md`](../CLAUDE.md) — deploy workflow, mandatory git workflow
5. The Reuse Inventory rows (§12) for your stream — open those files before writing your own

Memory file digest (already loaded into the harness):
- `feedback-admin-no-code` — admin UIs are sliders/toggles, never JSON
- `feedback-scaffold-ml-early` — log outcomes, set up bandit harness from v1
- `feedback-reuse-existing` — never build a parallel vendor integration
- `feedback-prod-discipline` — staging via Neon MCP, prod via checked-in migrations
- `project-staging-infra` — staging stack endpoints
- `project-per-market-config` — optimization settings configurable per-market
- `project-stripe-driver-gating` — drivers see all, must be Stripe-approved to act

---

## 3. v3 deltas from v2 spec

The following decisions override [`BLAST-BOOKING-SPEC.md`](./BLAST-BOOKING-SPEC.md). Where v2 conflicts, v3 wins.

| # | v2 (rolled-back) | v3 (build target) |
|---|---|---|
| D-1 | Drivers consume blasts via existing ride-request inbox; no new driver UI | New `/driver/requests` page that lists ALL open blasts in driver's market + new `/d/b/[shortcode]` driver-facing offer page (SMS deep-link target). Existing accept/decline endpoints are extended, but the driver-facing UX is new. |
| D-2 | Counter-price unbounded | Counter-price clamped to `± counter_offer_max_pct` per market (admin slider, default ±25%) |
| D-3 | Driver gender preference embedded in matching only | New profile-level `<GenderPreferenceField>` for both rider and driver: preferred genders multi-select + "Make this a hard requirement" toggle with live impact-estimate copy |
| D-4 | "When" picker = static chips + native datetime | NLP date parser (gpt-4o-mini, structured JSON output, 1.5s timeout) → falls back to chip picker; admin per-market `nlp_chip_only` toggle to disable LLM entirely |
| D-5 | Admin config = JSON editor in `/admin/blast-config` | **No-code config**: weight sliders w/ auto-normalize + colored category bars, hard-filter toggles w/ plain-English copy, limit steppers, named preset chips, live simulator panel showing ranked candidates with stacked-bar score breakdown. **Banned:** any raw JSON textarea or Monaco editor in admin UI. |
| D-6 | Reward function not configurable | Per-market reward function dropdown (default `revenue_per_blast`); switching requires confirmation modal showing 7d historical impact |
| D-7 | Matcher = single internal impl | `MatchingProvider` interface with `InternalMatcher` impl; env var per market `MATCHING_PROVIDER=internal\|mcp:<name>\|http:<url>` enables drop-in swap (failover to internal) |
| D-8 | No event log for non-notified candidates | New `blast_driver_events` table — every (blast, driver) gets logged at every funnel stage including non-notified. Drives `/admin/blast/[id]` observability page (D-9). |
| D-9 | Per-blast admin view = drawer w/ target list | Full-page `/admin/blast/[id]` with: funnel visualization, per-driver table (score breakdown bars, filter pass/fail, SMS delivery, feed impression, deep-link click, offer page view, response), event timeline, plain-English "why this match" summary, real-time admin debug Ably channel |
| D-10 | Stripe Connect required to receive blasts | Drivers see + receive SMS without Stripe; Stripe-approval check happens at HMU/counter endpoint with inline payout-onboarding overlay (not a hidden button) |
| D-11 | Schema: counter price = `hmu_counter_price`, no pull-up state, no calendar table | **Additive migration only** (per §11.4 non-regression): add new `counter_price` column alongside existing `hmu_counter_price`; new code reads/writes `counter_price`; backfill old → new; old column kept until v3 ships and is verified, then dropped in a follow-up. Add `pull_up_at`, `interest_at` columns. New `driver_schedule_blocks` table for soft (5-min select) and hard (pull-up) blocks |
| D-12 | localStorage draft 1hr TTL | localStorage draft 30min TTL via `lib/storage/blast-draft.ts` helper (no direct `window.localStorage` calls anywhere) |
| D-13 | Photo upload after rider profile | Same — photo HARD GATE, but for new sign-up flow only. Existing rider sign-in path SKIPS username + photo entirely (resumes draft → review → send) |
| D-14 | Continuous learning = unspecified | Stage 0 logging from v1 (`blast_match_log` w/ filter_results + `blast_driver_events`); Stage 1 ε-greedy bandit (10% explore default) on weight presets at ~500 blasts; Stage 2 logistic regression at ~5K blasts; pure JS, no Python service |
| D-15 | "Resend identical blast" not in API | New `POST /api/blast/[id]/duplicate` returns prefilled draft (rider can edit before re-sending) |
| D-16 | SQL parameter binding via `sql.unsafe` (cause of 7+ post-revert fix commits) | `sql.unsafe` BANNED in `lib/blast/**` via ESLint `no-restricted-syntax` rule. Use Drizzle or `sql\`...\`` template tags only. |

Everything else in [`BLAST-BOOKING-SPEC.md`](./BLAST-BOOKING-SPEC.md) — flow shape, schema basics, SMS gating, race handling, feature flags, anti-abuse, Ably channels, PricingStrategy integration, microanimation principles, acceptance criteria — **stays.**

---

## 4. Stream ownership matrix

Five parallel streams after Gate 2. Each runs in an `isolation: "worktree"` agent with the listed file ownership. **Cross-stream file edits require pause + ping the integration owner — no exceptions.**

| Stream | Files (exclusive) | New files allowed under | Reads but does not write |
|---|---|---|---|
| **A — Rider unauth → auth flow** | `app/blast/**`, `app/rider/blast/new/**`, `app/auth-callback/blast/**` (new subdir for blast handoff), `lib/storage/blast-draft.ts`, `lib/blast/date-parser.ts`, `components/blast/form/**`, `components/blast/handoff/**` | `app/blast/`, `components/blast/form/`, `components/blast/handoff/`, `lib/blast/date-parser/` | Stream B's contract types, Stream E's shared components |
| **B — Blast lifecycle API + offer board** | `app/api/blast/**` (all new routes), `app/rider/blast/[shortcode]/**` (offer board UI), `lib/blast/lifecycle.ts`, `lib/blast/notify.ts` (extend, don't rewrite — preserve existing voip.ms wiring), `lib/blast/voipms-webhook.ts` (new webhook handler), Cron Worker config for blast expiry | `app/api/blast/`, `app/rider/blast/[shortcode]/`, `lib/blast/lifecycle/`, `lib/blast/notify/` | Stream C's HMU/counter endpoint contracts (impl on B side, called from C UI) |
| **C — Driver experience** | `app/driver/requests/**`, `app/d/b/[shortcode]/**`, `components/blast/driver/**`, `components/profile/gender-preference-field.tsx`, driver-side calendar block writes via Stream B's API | `app/driver/requests/`, `app/d/b/`, `components/blast/driver/`, `components/profile/` | Stream B's endpoint shapes; Stream E's score-bar component |
| **D — Admin observability** | `app/admin/blast/**` (per-blast detail + index), `components/admin/blast-funnel/**`, `components/admin/blast-event-timeline/**`, `app/api/blast/[id]/impressions/beacon/route.ts`, `app/api/admin/blast/**` (admin read APIs) | `app/admin/blast/`, `components/admin/blast-*/`, `app/api/admin/blast/` | `blast_driver_events` table (read-only from D's perspective; events are written by B and C) |
| **E — Admin no-code config + bandit** | `app/admin/blast-config/**` (full rebuild), `components/admin/blast-config/**` (sliders, presets, simulator), `lib/blast/bandit.ts`, `lib/blast/reward.ts`, `lib/blast/config.ts` (extend), `app/api/admin/blast-config/**` (save + audit + rollback), shared score-bar component `components/blast/score-breakdown-bars.tsx` (E builds; C and D consume) | `app/admin/blast-config/`, `components/admin/blast-config/`, `lib/blast/bandit/`, `lib/blast/reward/` | Existing matching algorithm in `lib/blast/matching.ts` |

Shared write target: `lib/db/types.ts` is regenerated by the Schema Agent in Gate 2 and frozen during the parallel sprint. If a stream needs a new column, it pauses and the Schema Agent extends + regenerates types.

---

## 5. Visual rules (blast-specific)

Reference [`BRAND_GUIDE.md`](./BRAND_GUIDE.md) for everything not listed here. The rules below are blast-feature-specific and binding across streams.

### 5.1 Mobile viewport

- **Header offset is non-negotiable.** Every blast page applies `paddingTop: 'var(--header-height)'` (3.5rem) — no element renders behind the fixed header.
- **Above-the-fold rule (multi-step form):** on a 390×844 (iPhone 12/13/14) viewport, every step's primary input (the field the user must interact with to advance) is fully visible WITHOUT scrolling. Secondary inputs and helper copy may sit below the fold.
- Screens to verify before stream PR ships: 390×844 (iPhone 12), 375×812 (iPhone SE 2nd gen), 412×915 (Pixel 7).

### 5.2 Surfaces & color use

- Blast pages use the dark surfaces (`#080808` page bg, `#141414` cards). HMU green `#00E676` is the primary CTA color.
- Driver-side UI (Stream C) uses the same green CTA — it's earning. Rider-side action color is also green; **rider purple/pink** from BRAND_GUIDE §2.4 is for marketing surfaces only, not in-product blast UI.
- Countdown timer color shift: HMU green → `#FFB300` amber at <5min remaining → `#FF4444` red at <1min. Same thresholds across rider and driver views.
- "Searching" state uses the green palette + the Neural Network Loader (§6.3). Never use the red destructive color for in-progress states.

### 5.3 Copy voice

- Use the exact strings from BRAND_GUIDE §7 vocab cheat sheet where they fit (HMU, OTW, BET, COO).
- Counter-offer button copy: **"HMU at $X"** (firm at rider's price) or **"Counter at $Y"**. Pass = **"Not for me"** (matches BRAND_GUIDE voice rules — never "Decline" or "Reject").
- Searching state copy on rider offer board: **"Notifying X drivers near you…"** then **"Y drivers are looking at your trip"** when impressions exist.
- Plain-English "why this match" summary on `/admin/blast/[id]` is template-based, not LLM-generated. Example template: *"Of {pool_size} drivers in {market}, {passed_filters} passed all filters. Top {notified_count} were notified. {selected_driver} (score {selected_score}) was {primary_reason}."*

### 5.5 Frontend feel bar (RAISED)

Backend scaffolding can be conventional quality. **Frontend feel is the differentiator** — every interaction should feel intentional and premium. The bar:

- **Zero "dead" interactions.** Every tap, swipe, focus, value change, and state transition has a corresponding micro-animation from §6 or §6.5. If you find yourself shipping a button without a `whileTap` or a state change without a transition, stop and add one.
- **Optimistic UI everywhere.** When the user takes an action with a network call, the UI updates immediately and reconciles on response. Spinners are only for >300ms operations the user is waiting on; sub-300ms work is invisible.
- **Anticipatory states.** When a user is one step away from being able to act, hint at it (subtle pulse on the disabled CTA, gentle attention to the field still required). When a user is about to receive data (Ably push imminent), prep the UI (skeleton in the slot the data will fill).
- **Layered motion.** Stagger entrance animations by 60–100ms across siblings — never animate 8 cards in unison; cascade them.
- **Feel before content.** A page loads its motion shell (skeletons, loaders, layout) within 100ms even if data takes 1s+. The user never sees a blank screen.
- **Sound (optional, off by default).** No haptics or sound in v1; design for them in v2 — leave hooks at every reward moment (HMU received, match locked, pull-up sent).
- **Reduced-motion equivalence.** When `prefers-reduced-motion: reduce`, motion is replaced with opacity-only fades — but the visual hierarchy and timing intent survives.

**Integration agent runs a "feel polish pass" after all streams merge** (see §11.3). Streams that ship a functional but flat UI will be flagged for rework before the polish pass — the bar is "feels finished," not "works."

### 5.4 Score-breakdown bars (shared component)

Used in Stream D (admin observability per-driver row) AND Stream E (admin config simulator). Owned by Stream E, consumed by D.

- Horizontal stacked bar, full width of container.
- Each segment width ∝ that signal's contribution to total score.
- Segment colors map to signal category:
  - **Proximity signals**: green `#00E676`
  - **Trust signals** (rating, chill_score, completed_rides): blue `#448AFF`
  - **Preference signals** (sex_match): purple `#A855F7`
  - **Behavioral signals** (recency, low_pass_rate, profile_views): amber `#FFB300`
- Hover (or tap on mobile) reveals tooltip with signal name + raw value + weight + contribution.
- Below the bar: total score in Space Mono, right-aligned.

---

## 6. Animation primitives (built in Gate 2, consumed by all streams)

Built once during Gate 2 and exported from `components/blast/motion/`. Streams import; never reimplement.

### 6.1 Easing & duration

| Use | Duration | Easing |
|---|---|---|
| Button press / micro-interaction | 150ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Form step transition (slide) | 280ms | `cubic-bezier(0.32, 0.72, 0, 1)` (iOS-style) |
| Bottom-sheet open/close | 320ms | same as step transition |
| Driver card glide-in (offer board) | 250ms ease-out, staggered 80ms per card | reuse from commit `10c1ed6` per BLAST-BOOKING-SPEC §14 |
| Score bar fill | 400ms ease-out | — |
| Confetti (already exists) | per `celebration-confetti.tsx` defaults | — |
| Neural Network Loader (§6.3) | continuous 2.4s loop | sinusoidal opacity |

All transitions respect `prefers-reduced-motion: reduce` — replace transforms with opacity-only where possible; remove confetti entirely.

### 6.2 Button micro-interaction

- Primary CTA: `whileTap={{ scale: 0.97 }}` via Framer Motion, 150ms spring (`type: 'spring', stiffness: 400, damping: 30`)
- Hover (desktop only — feature-detect via `(hover: hover)` media query): `whileHover={{ scale: 1.03, boxShadow: 'var(--glow-lg)' }}`
- Primary CTA loading state: button content morphs to spinner; width is preserved to prevent layout shift

### 6.3 The Neural Network Loader

Used during the matching/searching state on the rider offer board. This is the "pulsing neural network searching feel" from the requirements. Spec:

- SVG canvas, 5×5 grid of nodes (25 dots), each node a 4px circle
- Thin 1px lines connect each node to its 4 nearest neighbors (~40 edges total)
- At any moment, 3–5 random nodes pulse: opacity 0.3 → 1.0 → 0.3 over 1.2s using `easeInOut`
- Edges adjacent to a pulsing node fade in (opacity 0.1 → 0.5) for the same duration, creating a "signal traveling" feel
- Color: HMU green `#00E676` for nodes; edges in `rgba(0, 230, 118, 0.15)`
- Random seed advances every 600ms — gives a continuous shimmer without being chaotic
- Below the SVG: text label, e.g. *"Notifying 7 drivers…"* in DM Sans 14px `#BBBBBB`
- Reduced-motion fallback: static grid + a single text-only "Searching…" with `animate-pulse` opacity

Built in `components/blast/motion/neural-network-loader.tsx`. Stream B uses it on the offer board; Stream E uses a smaller variant on the admin simulator while a dry-run match runs.

### 6.4 Bottom-sheet pattern

Built in `components/blast/motion/bottom-sheet.tsx` (or extend the existing `components/ui/sheet.tsx` from shadcn — verify in Gate 2).

- Drag handle visible at top
- Drags down → dismiss past 30% threshold; otherwise snaps back with spring (`stiffness: 350, damping: 30`)
- Backdrop `rgba(0,0,0,0.6)` with backdrop-blur-sm, fades in 200ms
- Step transitions inside the sheet: horizontal slide (next step enters from right, current exits left), 280ms
- Sheet height auto-fits content with min-height 50vh and max-height 92vh

### 6.5 Motion library — additional primitives (Gate 2 must build)

These are reused across streams. Built once during Gate 2, exported from `components/blast/motion/`. Streams import; never reinvent.

| Primitive | Purpose | Spec |
|---|---|---|
| `<PulseOnMount>` | Draw attention to a newly-rendered element | scale 0.96 → 1.04 → 1.0 over 600ms, single pass; opacity 0 → 1 |
| `<SuccessCheckmark>` | Replace a button's content after success action | spinner → green checkmark morph using SVG path interpolation, 800ms; auto-fades after 1.2s |
| `<CountUpNumber>` | Animate a numeric value change (price, count, score) | requestAnimationFrame lerp from old to new, 350ms, ease-out; respects mono font for stats |
| `<ShimmerSlot>` | Skeleton that hints at the shape of incoming data | gradient shimmer left-to-right 1.4s loop; matches the size/radius of the eventual content |
| `<SwipeableCard>` | Driver-facing offer card with swipe-up = HMU, swipe-down = pass | drag detection w/ Framer Motion; threshold 30% of card height; rubber-band past threshold; haptic-ready hook |
| `<MagneticButton>` | Primary CTA hover that subtly tracks cursor (desktop only) | mouse position drives 4px translate; resets on mouseleave; disabled on touch via `(hover: hover)` MQ |
| `<CountdownRing>` | Circular countdown for per-target 15min window | SVG circle with stroke-dashoffset animation; color shifts at 5min (amber) and 1min (red) per §5.2 |
| `<StaggeredList>` | Animate children entering with cascading delay | wraps any list, applies 60–100ms stagger to children's entrance |
| `<TypingDots>` | Three-dot "Driver typing…" indicator for live offer board | 3 dots, opacity cascade 0.3 → 1 → 0.3 over 1.2s, offset 0/200/400ms |
| `<NeuralNetworkLoader>` | The big one — see §6.3 | grid of pulsing nodes + edges |

Each primitive ships with: TypeScript props interface, Storybook example (or a `__demo` route), reduced-motion variant, accessibility annotations.

### 6.6 Micro-animation moments catalog

Specific moments where the listed primitive (or behavior) is required. Streams cross-reference this when implementing.

| Surface | Moment | Required motion |
|---|---|---|
| `/blast` | Driver card hover (desktop) | `<MagneticButton>` glow |
| `/blast` | "Get a Ride" CTA at rest | subtle 1.2s opacity pulse 0.92 ↔ 1.0 |
| Form bottom sheet | Open | sheet slides up with backdrop fade (320ms) |
| Form bottom sheet | Step → next | horizontal slide-in from right (280ms); old step slides out left |
| Form input | Field focus | label floats up + accent underline draws in (180ms) |
| Form input | Validation error | shake (3 oscillations × 4px, 250ms) + red accent |
| Pickup/dropoff | Address confirmed | `<SuccessCheckmark>` inline + map preview slides in below (300ms) |
| Price input | Stepper +/- | `<CountUpNumber>` between old and new value |
| Send blast CTA | Tap | spinner morph; on success → checkmark; on next route → page transition |
| Username field | Typing | debounced check; available state shows green dot + checkmark fade-in; taken state shows red shake |
| Confetti moment | Username confirmed | existing `<CelebrationConfetti>` |
| Photo upload | Capture → upload | thumbnail snaps in with `<PulseOnMount>`; progress ring around thumbnail |
| Offer board | Empty state (notifying) | `<NeuralNetworkLoader>` + "Notifying X drivers…" |
| Offer board | Driver HMU arrives | card glides in from right (250ms ease-out, +24px → 0); price pulses with `<CountUpNumber>` if counter |
| Offer board | Multiple HMUs | `<StaggeredList>` cascade 80ms |
| Offer board | Per-target countdown | `<CountdownRing>` |
| Offer board | Driver typing indicator (counter being entered, via Ably presence) | `<TypingDots>` next to driver name |
| Select driver | Tap | optimistic lock — card scales 1.02 → 1.0 + ring; other cards dim to 0.4 with 200ms fade |
| Stripe Payment Element | Slide-in | bottom sheet expands to reveal Stripe Element; pre-existing slot uses `<ShimmerSlot>` for first 200ms |
| Pull Up CTA | Tap | spinner → checkmark → 600ms hold → page transition to ride flow |
| Cancel | Confirm | sheet slides down + backdrop fades; toast confirmation |
| `/driver/requests` | Card list | `<StaggeredList>` on mount + `<ShimmerSlot>` while loading |
| `/driver/requests` | New blast arrives | new card slides in from top with `<PulseOnMount>`; subtle haptic-ready hook |
| `/d/b/[shortcode]` | HMU button | `whileTap` scale 0.97; on success → checkmark morph + page transition |
| `/d/b/[shortcode]` | Counter slider | drag interaction with snap to whole-dollar increments; current value uses `<CountUpNumber>` |
| `/d/b/[shortcode]` | Pass | `<SwipeableCard>` swipe-down OR explicit "Not for me" button with collapse animation |
| `/d/b/[shortcode]` | Stripe gate overlay | sheet slides up over content with backdrop blur; "Link payout" CTA pulses |
| `/admin/blast/[id]` | Funnel visualization | bars draw in left-to-right 400ms ease-out |
| `/admin/blast/[id]` | Per-driver row expand | accordion 200ms; score breakdown bars draw on expand |
| `/admin/blast/[id]` | Real-time event arrival | new row slides in at top of timeline with `<PulseOnMount>` |
| `/admin/blast-config` | Slider drag | live value updates with `<CountUpNumber>`; weight category bars resize smoothly |
| `/admin/blast-config` | Save | spinner → checkmark → "Saved" toast |
| `/admin/blast-config` | Simulator run | smaller `<NeuralNetworkLoader>` while computing; results table cascades in with `<StaggeredList>` |
| All routes | Page transition | `<motion.div>` wrapper, opacity + 8px translateY (180ms ease-out) — feels lighter than full slide |

---

## 7. TypeScript type contracts (locked in Gate 2)

All exported from `lib/blast/types.ts`. Do not modify after Gate 2 without coordinating with all streams.

```ts
// ---- Form & draft ----
export type GenderOption = 'man' | 'woman' | 'nonbinary';
export type GenderPreference = { preferred: GenderOption[]; strict: boolean };

export interface BlastDraft {
  pickup: { lat: number; lng: number; address: string; mapboxId?: string };
  dropoff: { lat: number; lng: number; address: string; mapboxId?: string };
  tripType: 'one_way' | 'round_trip';
  scheduledFor: string | null;            // ISO timestamp; null = ASAP
  storage: boolean;
  priceDollars: number;
  riderGender: GenderOption | null;
  driverPreference: GenderPreference;
  parsedFromText?: string;                // original "next Wednesday" string for audit
  nlpConfidence?: number;                 // 0..1 if parsed by LLM
  draftCreatedAt: number;                 // epoch ms
}

// ---- Create blast ----
export interface BlastCreateInput extends BlastDraft {
  marketSlug: string;                     // resolved client- or server-side
}

export interface BlastCreateResult {
  blastId: string;
  shortcode: string;
  expiresAt: string;
  targetedCount: number;
}

// ---- Matching ----
export interface BlastConfig {
  weights: Record<string, number>;        // see §6 of BLAST-BOOKING-SPEC for keys
  hardFilters: Record<string, unknown>;
  limits: Record<string, number | boolean>;
  rewardFunction: 'revenue_per_blast' | 'accept_rate' | 'accept_x_completion' | 'time_to_first_hmu';
  counterOfferMaxPct: number;             // 0..1, e.g. 0.25 = ±25%
  feedMinScorePercentile: number;         // 0..100
  nlpChipOnly: boolean;
  configVersion: number;
}

export interface MatchCandidate {
  driverId: string;
  rawFeatures: Record<string, number>;
  normalizedFeatures: Record<string, number>;
  filterResults: Array<{ filter: string; passed: boolean; value: unknown; threshold: unknown }>;
  score: number;
  scoreBreakdown: Record<string, number>; // signalKey → contribution to score
}

export interface MatchResult {
  configVersion: number;
  providerName: string;
  experimentArmId?: string;
  candidates: MatchCandidate[];           // ALL candidates considered, full funnel
  notifiedDriverIds: string[];            // subset of candidates
  fallbackDriverIds: string[];            // candidates passed filters but below notify cutoff
  expandedRadius: boolean;
}

export interface MatchingProvider {
  name: string;
  match(input: BlastCreateInput, config: BlastConfig): Promise<MatchResult>;
}

// ---- Targets & responses ----
export type DriverResponseType = 'hmu' | 'counter' | 'pass' | 'expired';

export interface BlastDriverTargetSnapshot {
  id: string;
  blastId: string;
  driverId: string;
  matchScore: number;
  scoreBreakdown: Record<string, number>;
  notifiedAt: string | null;
  notificationChannels: ('push' | 'sms')[];
  hmuAt: string | null;
  counterPrice: number | null;
  passedAt: string | null;
  selectedAt: string | null;              // soft hold, 5min
  pullUpAt: string | null;                // hard, payment captured
  rejectedAt: string | null;
  interestAt: string | null;              // non-targeted driver expressed interest via /driver/requests
}
```

---

## 8. API endpoint contracts (stubs in Gate 2, impl in streams)

Schema-only definitions land in Gate 2 as 501-Not-Implemented stubs so streams can build against them in parallel.

| Method | Path | Owner stream | Auth | Body / Params | Response |
|---|---|---|---|---|---|
| POST | `/api/blast/estimate` | B | none | `{ pickup, dropoff }` | `{ distanceMi, suggestedPriceDollars, depositCents }` |
| POST | `/api/blast` | B | required | `BlastCreateInput` | `BlastCreateResult` |
| GET | `/api/blast/[shortcode]` | B | required (rider only) | — | `{ blast, targets: BlastDriverTargetSnapshot[], fallback: BlastDriverTargetSnapshot[] }` |
| POST | `/api/blast/[id]/select/[targetId]` | B | required (rider only) | — | `{ selectedAt, expiresAt }` (5min soft hold) |
| POST | `/api/blast/[id]/pull-up/[targetId]` | B | required (rider only) | — | `{ pullUpAt, paymentIntentId }` |
| POST | `/api/blast/[id]/cancel` | B | required (rider only) | — | `{ cancelledAt }` |
| POST | `/api/blast/[id]/duplicate` | B | required (rider only) | — | `{ draft: BlastDraft }` |
| POST | `/api/blast/[id]/bump` | B | required (rider only) | `{ additionalDollars }` | `{ newPriceDollars, newRadiusMi, expandedTargetCount }` |
| POST | `/api/blast/[id]/targets/[targetId]/hmu` | B | required (driver) | — | `{ hmuAt }` (Stripe gate enforced; returns 402 + onboarding URL if missing) |
| POST | `/api/blast/[id]/targets/[targetId]/counter` | B | required (driver) | `{ counterPriceDollars }` | `{ counterAt, counterPrice }` (clamped to ±counterOfferMaxPct) |
| POST | `/api/blast/[id]/targets/[targetId]/pass` | B | required (driver) | — | `{ passedAt }` |
| POST | `/api/blast/[id]/impressions/beacon` | D | required (driver) | `{ source: 'feed' \| 'detail' }` | `{ ok: true }` (rate-limited 1/sec/driver) |
| POST | `/api/blast/voipms/webhook` | B | webhook signature | voip.ms payload | `{ ok: true }` (writes `sms_delivered` / `sms_failed` events) |
| GET | `/api/admin/blast` | D | admin perm `monitor.blasts` | query: `market`, `status`, `from`, `to`, funnel filter | paginated `{ blasts: [...] }` |
| GET | `/api/admin/blast/[id]` | D | admin perm `monitor.blasts` | — | `{ blast, candidates: MatchCandidate[], events: BlastDriverEvent[], summary: string }` |
| POST | `/api/admin/blast-config` | E | admin perm `grow.blast_config` | `Partial<BlastConfig> & { marketSlug?, reason? }` | `{ configVersion, auditId }` |
| POST | `/api/admin/blast-config/rollback` | E | admin perm `grow.blast_config` | `{ targetVersion, reason }` | `{ configVersion, auditId }` |
| POST | `/api/admin/blast-config/simulate` | E | admin perm `grow.blast_config` | `{ blastId } \| BlastCreateInput, configOverride?` | `MatchResult` (dry-run, no side effects) |

Permission slugs registered in `lib/admin/route-permissions.ts` per [`BLAST-BOOKING-SPEC.md`](./BLAST-BOOKING-SPEC.md) §7.

---

## 9. Event log schema (locked in Gate 2)

New table `blast_driver_events`, append-only. Source of truth for the funnel — Stream D's observability page is built on it.

```sql
CREATE TABLE blast_driver_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL REFERENCES hmu_posts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  source TEXT NOT NULL,                    -- matcher | notifier | voipms_webhook | client_beacon | driver_action | rider_action
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_blast_driver_events_blast ON blast_driver_events(blast_id, occurred_at);
CREATE INDEX idx_blast_driver_events_driver ON blast_driver_events(driver_id, occurred_at DESC);
```

`event_type` values (locked):

| event_type | Source | When written |
|---|---|---|
| `candidate_considered` | matcher | every driver in raw candidate pool |
| `filter_failed` | matcher | each hard filter a driver fails (one event per filter) |
| `scored` | matcher | after scoring completes |
| `notify_eligible` | notifier | driver passed all gates (push + SMS prefs) |
| `notify_skipped` | notifier | gate failed (event_data.reason: quiet_hours\|rate_limit\|disabled\|min_fare) |
| `sms_sent` | notifier | voip.ms accepted send |
| `sms_delivered` | voipms_webhook | delivery confirmed |
| `sms_failed` | voipms_webhook | delivery failed |
| `push_sent` | notifier | Ably push fired |
| `push_delivered` | client_beacon | rider/driver app ack'd push |
| `feed_impression` | client_beacon | driver scrolled blast card into view on /driver/requests |
| `deep_link_clicked` | client_beacon | driver opened SMS shortcode link |
| `offer_page_viewed` | client_beacon | /d/b/[shortcode] rendered for the driver |
| `hmu` | driver_action | driver tapped HMU |
| `counter` | driver_action | driver submitted counter price |
| `pass` | driver_action | driver tapped Pass |
| `expired` | matcher (cron) | per-target 15min countdown elapsed |
| `selected` | rider_action | rider selected this driver (soft hold) |
| `pull_up` | rider_action | rider pulled up (hard, payment captured) |
| `rejected` | rider_action | rider chose someone else |

Writes are fire-and-forget; failures go to Upstash retry queue. Never block the matching path on event log writes (NFR-19).

---

## 10. PostHog event catalog

Lock these names in Gate 2; streams emit per their UI surface.

| Event | Owner stream | Properties |
|---|---|---|
| `blast_form_started` | A | market, source (browse \| direct) |
| `blast_form_step_completed` | A | step, fieldName, value (sanitized) |
| `blast_form_abandoned` | A | lastStep, durationMs |
| `blast_draft_saved` | A | hasAllRequired |
| `blast_draft_restored` | A | source (signin \| signup), ageMs |
| `blast_draft_expired` | A | ageMs |
| `blast_nlp_parsed` | A | confidence, fallbackUsed |
| `blast_handoff_signup_started` | A | — |
| `blast_handoff_signin_started` | A | — |
| `blast_username_check` | A | available, reason |
| `blast_photo_uploaded` | A | sizeBytes, mimeType |
| `blast_submitted` | A | priceDollars, distanceMi, hasGenderPref |
| `blast_match_completed` | B | candidateCount, notifiedCount, expandedRadius, providerName, configVersion |
| `blast_target_hmu` | B | counterPrice, deltaFromAsk |
| `blast_target_counter` | B | counterPrice |
| `blast_target_pass` | B | reason |
| `blast_selected` | B | targetId, secondsToSelect |
| `blast_pulled_up` | B | priceDollars |
| `blast_cancelled_by_rider` | B | stage (pre_select \| post_select \| post_pull_up) |
| `blast_cancelled_by_driver` | C | stage |
| `blast_duplicated` | B | sourceBlastId |
| `driver_requests_feed_viewed` | C | visibleBlastCount |
| `driver_offer_page_viewed` | C | source (sms \| feed \| push) |
| `driver_stripe_gate_shown` | C | action (hmu \| counter) |
| `admin_blast_config_changed` | E | fieldsChanged[], reason |
| `admin_blast_config_rolled_back` | E | fromVersion, toVersion |
| `admin_blast_simulator_run` | E | candidateCount |
| `admin_blast_experiment_promoted` | E | armId, sampleSize, winProbability |

---

## 11. Definition of Done

### 11.1 Per-stream DoD

A stream's PR cannot mark itself done. Integration agent verifies. **Each stream's PR must satisfy:**

1. **Visual QA** on 390×844, 375×812, 412×915 viewports — no element behind header, no horizontal scroll, primary input above fold on every form step (Stream A only)
2. **Type contracts honored** — no modifications to `lib/blast/types.ts` outside Gate 2
3. **File ownership respected** — diff touches only files in stream's column of §4
4. **No `sql.unsafe`** in any new code (lint passes)
5. **PostHog events emitted** for every user action listed in §10 owned by this stream
6. **Sentry boundary** wraps every new page route
7. **Upstash rate limit** applied per any new mutating endpoint
8. **Reduced-motion** verified on all new animations
9. **Reuse Inventory honored** — no new vendor SDKs added; no parallel implementations of cancellation, payment linking, photo upload, address autocomplete, SMS, Stripe Connect onboarding
10. **Schema unchanged** unless coordinated through Schema Agent (which then regens types and notifies all streams)
11. **Observability events written** for every funnel stage owned by this stream (§9)
12. **Staging deploy verified** — feature works on staging.hmucashride.com after auto-deploy
13. **DoD checklist in PR description**, each item checked or explained

### 11.2 Frontend feel DoD (Streams A, B-offer-board, C, D-detail-page, E-config)

Every front-end stream additionally must:

14. **Every interactive element has a `whileTap` or equivalent micro-interaction** (no flat buttons)
15. **Every state change has a transition** (no jarring re-renders; data changes use `<CountUpNumber>` or `<ShimmerSlot>`; element entries use `<StaggeredList>` or `<PulseOnMount>`)
16. **Every moment in the §6.6 catalog** that maps to your stream's surfaces is implemented
17. **Optimistic UI** for any user-initiated mutation — UI updates immediately, reconciles on response
18. **Loading shell appears within 100ms** even if data is slow — no blank screens
19. **Reuses primitives from `components/blast/motion/`** — no parallel motion implementations

### 11.4 Non-regression (BINDING — applies to every stream + Gate 2)

Live users + live revenue in prod. **No new work may break existing rider, driver, or admin functionality.** Per [[feedback-no-regression]]:

- **Schema migrations are additive.** Never rename or drop columns in place. To rename: add new column → backfill → cut readers → drop old in a separate follow-up PR after v3 ships.
- **UI replacements are feature-flagged or shadow-deployed.** When rebuilding an existing page (notably `/admin/blast-config` in Stream E), the old page stays live until the new one is verified on staging. Both share the same backing data so toggling between them is non-destructive.
- **Reused code paths preserve behavior.** When extending existing handlers (ride cancellation, Stripe Connect onboarding, voip.ms SMS, payment intents), existing inputs/outputs must continue to work unchanged. Only add new branches; never modify existing ones in the same PR.
- **Surgical changes only.** "While I'm here" cleanups go in a separate PR after the surgical change ships and is verified.
- **Verify before merge.** Each stream PR includes a manual smoke test on staging of the adjacent existing flow (e.g., Stream B verifies existing ride cancellation still works; Stream C verifies existing Stripe Connect onboarding still works; Stream E verifies the OLD admin config page still loads and reads/writes data correctly until the new one fully replaces it).
- **Rollback story:** every PR description states the rollback procedure. For schema PRs: which migration to revert. For code PRs: the revert SHA + any manual data cleanup needed.

If a stream cannot ship its scope without modifying existing behavior, **stop and coordinate** — don't ship the regression.

### 11.3 Integration polish pass (after all streams merge)

The integration agent does a final feel polish pass before production cutover:

- Walks every blast surface as a real user would on a real device (or 1:1 emulation)
- Identifies any moment in §6.6 that's missing or feels flat
- Adds missing animations or files an issue per stream owner
- Audits cross-stream consistency: do form transitions match? Do success states all use the same checkmark? Do all CTAs share the same spring?
- Tunes timings holistically — animation that felt right in isolation may need 50ms shaved when chained
- Verifies reduced-motion mode top-to-bottom
- Final visual diff sweep across the 3 reference viewports

---

## 12. Reuse Inventory

Stream agents open these files BEFORE writing parallel code. Build on top, don't replace.

| Need | Reuse | Source file |
|---|---|---|
| Brand tokens | CSS vars / Tailwind config | `app/globals.css`, `app/page.module.css`, BRAND_GUIDE.md |
| Header + `--header-height` var | existing | `components/layout/header.tsx` |
| Address autocomplete (Mapbox) | `<AddressAutocomplete>` | `components/ride/address-autocomplete.tsx` |
| Photo upload | `POST /api/upload/video` | `app/api/upload/video/route.ts` |
| Username uniqueness | `GET /api/riders/check-handle` | `app/api/riders/check-handle/route.ts` |
| Confetti | `<CelebrationConfetti>` | `components/shared/celebration-confetti.tsx` |
| Rider PM linking | setup-intent + save + `<FirstTimePaymentBlocker>` | `app/api/rider/payment-methods/*`, `lib/stripe/rider-payments.ts` |
| Driver Stripe Connect onboarding | existing flow (audit at start of Phase 4) | TBD — Stream C verifies before writing the gate overlay |
| Ride cancellation handlers | existing state-machine | TBD — Stream B audits at start of phase, wires blast cancel into existing handlers |
| Ride state machine | existing | per `docs/RIDE-FLOW.md` |
| voip.ms SMS | `lib/sms/textbee.ts` (don't rename — see [[sms_provider_actual]]) | `lib/sms/textbee.ts` |
| Clerk middleware | existing public-route allowlist pattern | `middleware.ts` |
| Ably token issuance | `/api/tools/ably/token` | per CLAUDE.md MCP tools |
| Driver browse query (basis for /blast page) | `lib/hmu/browse-drivers-query.ts` | reuse query, hide HMU button via prop |
| Skeleton/shimmer loaders | existing | `components/hmu/browse/skeletons.tsx` + `styles.tsx` |
| PostHog provider | existing | `components/analytics/posthog-provider.tsx` |
| Sentry error boundaries | existing pattern | follow existing pages |
| Upstash rate limit pattern | existing | grep `@upstash/ratelimit` for usage examples |
| Cloudflare Images (image transforms) | `cf.image` per CLAUDE.md | reuse for SMS link previews / og:image |
| Profile completion gate pattern | `<ProfileCompletionCard>` | reuse for "Link payout to drive" overlay |

---

## 13. Production discipline

- All schema work prototyped via Neon MCP on staging branch. Migration files are committed to `lib/db/migrations/` so prod deploys ship them through the standard pipeline. No MCP mutations against prod, ever.
- Each stream's PR auto-deploys to staging on merge to main via `.github/workflows/deploy-staging.yml`. Verify on staging.hmucashride.com before marking PR done.
- Production deploy is manual and requires explicit founder go per CLAUDE.md "MANDATORY GIT WORKFLOW."
- Live users in prod. Hotfixes follow the same cycle (staging first). No `wrangler deploy` against prod without merged PR.

See `feedback-prod-discipline` and `project-staging-infra` memories.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| Blast | A rider-initiated ride request fanned out to multiple drivers in parallel |
| Target | A specific (blast, driver) row — represents one driver who was matched + notified |
| HMU | Driver action: "I want this ride, at the price you asked" |
| Counter | Driver action: "I want this ride, at $Y instead" (bounded ±counterOfferMaxPct) |
| Pass | Driver action: "Not for me" |
| Select | Rider action: "I'm choosing this driver" — soft 5min hold, payment captured |
| Pull Up | Rider action: "Confirm — driver, come now" — hard block, ride flow engages |
| Provider | A `MatchingProvider` impl — `InternalMatcher` is v1; future MCP/HTTP swap-ins possible |
| Stage 0/1/2 | ML rollout stages — logging only / bandit on presets / logistic regression — per §3 D-14 |

---

## 15. Change log

- **v3 (2026-05-14)** — initial v3 contract; supersedes v2 spec where §3 deltas conflict.
