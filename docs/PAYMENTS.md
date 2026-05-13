# PAYMENTS — HMU ATL

> Money rules. Auto-loaded into every Claude Code session via `@docs/PAYMENTS.md` in the root `CLAUDE.md` because the in-app-only Stripe lock and the capture-at-Start-Ride contract are high-blast-radius.

---

## ⚠️ LAUNCH MODEL: DEPOSIT-ONLY (locked 2026-05-07)

**The pricing model in this document describes the FUTURE-STATE full-fare flow.** The launch model is **deposit-only**: rider authorizes a small deposit at Pull Up, driver captures it at Start Ride, **driver collects the remainder in cash on arrival**.

| Aspect | Deposit-only (LAUNCH) | Full-fare (this doc, eventual) |
|---|---|---|
| Captured amount | Deposit only ($5 min, even increments, ≤ 50% of total fare; rider-selected per ride) | Full fare |
| Platform fee | `max($1.50, 20% × deposit)` — admin-configurable floor + percent | Progressive tier table below |
| Driver remainder | Cash, off-platform | N/A (all on-platform) |
| HMU First subscription | Deactivated, labeled **"Coming Soon"** | Active per fee table below |
| No-show | 100% of deposit captured (minus fee). No 25/50 election. | Driver elects 25% or 50% (table below) |
| Mode resolver | `PricingStrategy` pattern at `lib/payments/strategies/`; cohort-driven (`pricing_modes`, `pricing_cohorts`, `pricing_cohort_assignments`) | Implemented as `legacy_full_fare` strategy behind same registry |

**Rider booking UX in deposit-only:** rider sees split clearly ("$X deposit now, $Y cash to driver"); a hard-gated "I have $Y cash on me" checkbox blocks Pull Up.

**Spec source:** memory `deposit_only_launch_model.md` + `money_movement_canonical.md` (the future-state version of this doc). Implementation lives in `lib/payments/strategies/{legacy-full-fare,deposit-only}.ts`. Any code change touching `lib/payments/fee-calculator.ts` or `lib/payments/escrow.ts` should go through the strategy interface, not branch on a tier or flag inline.

**Why this doc still describes full-fare:** the strategy abstraction means the full-fare math will ship behind the same registry as `legacy_full_fare`. The numbers, capture sequence, and Stripe code samples below are accurate for THAT mode. For deposit-only at launch, rely on `lib/payments/strategies/deposit-only.ts` and `pricing_modes.config` JSON.

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

### HMU First Tier ($9.99/mo via Stripe Billing) — *labeled "Coming Soon" while deposit-only is the launch model*

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
| Start Ride checks pass (geofence + proximity + rider taps "I'm In" with GPS) | Capture fires → funds transfer to driver Connect → cash-out unlocks ✅ |
| Pickup geofence fails at Start Ride | Driver sees "You're not at the pickup yet" — capture does not fire, ride stays at HERE |
| Rider GPS proximity fails (rider sharing GPS) | Driver sees "You're not near your rider yet" — capture does not fire |
| Rider doesn't tap "I'm In" before deadline | Button stays clickable past deadline. Capture does not fire. Driver can pulloff (0% / 25% / 50%) if rider truly didn't show. |
| Rider denies GPS or browser blocks geolocation | API rejects the confirm with a clear error; rider must enable GPS to confirm. Capture does not fire. |
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

## PAYMENT ARCHITECTURE (LOCKED)

### Charge Type: Destination Charges
- Rider pays the HMU ATL platform Stripe account
- Platform transfers net amount to driver's Stripe Connect account
- `application_fee_amount` calculated and set at **capture time** (not create)
- Capture time = **Start Ride** (driver tap + checks pass), not ride end. See `docs/RIDE-FLOW.md` for the full check chain.
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
| `no_show_timer_min` | 10 | Time at HERE before no-show can be triggered |
| `extension_minutes_per_grant` | 5 | Minutes added per approved extension |
| `extension_max_grants_per_ride` | 3 | Max extensions per ride |
| `extension_max_total_minutes` | 30 | Hard cap on total extension time per ride |
| `wait_fee_min_per_min` | 0.25 | Min wait fee a driver can set |
| `wait_fee_max_per_min` | 2.00 | Max wait fee a driver can set |
| `wait_fee_suggested_per_min` | 0.50 | Suggested default in driver profile |
| `comments_visibility_default` | `visible` | Default visibility for post-ride text comments |
| `driver_ghost_timeout_min` | 30 | Time after COO before auto-void if driver hasn't tapped OTW |
