# MONETIZATION — Fee Structure, Tiers & Payouts

> **Part of HMU ATL documentation suite.** See [CLAUDE.md](../CLAUDE.md) for core project context.

---

## PAYMENT ARCHITECTURE

- **Rider payments**: Stripe — Apple Pay, Google Pay, card, debit
- **Driver payouts**: Dots API (dots.dev) — Cash App, Venmo, Zelle, PayPal, bank
- **Stripe fee**: 2.9% + $0.30 per transaction (absorbed by platform, never charged to rider or driver)
- **Dots fee**: ~$0.25–$0.50 flat per payout (varies by rail — see payout table below)
- **Platform fee**: Extracted BEFORE Dots payout, applied to net after Stripe fee

---

## PROGRESSIVE FEE STRUCTURE — FREE TIER

Fees use **cumulative daily earnings** per driver. Resets **midnight ET daily** and **Sunday midnight ET weekly**.

| Cumulative Daily Earnings | Platform Takes | Driver Keeps |
|---|---|---|
| First $50/day | 10% | 90% |
| $50–$150/day | 15% | 85% |
| $150–$300/day | 20% | 80% |
| Over $300/day | 25% | 75% |
| **Daily cap** | **$40 max** | — |
| **Weekly cap** | **$150 max** | — |

---

## HMU FIRST TIER ($9.99/mo via Stripe Billing)

| All Earnings | Platform Takes | Driver Keeps |
|---|---|---|
| Flat rate | 12% | 88% |
| **Daily cap** | **$25 max** | — |
| **Weekly cap** | **$100 max** | — |

### Additional HMU First Perks vs Free
- Instant payout after every ride (Free = next morning 6am batch)
- Priority placement in rider's driver feed
- Read rider comments
- HMU First badge on profile
- Lower daily + weekly cap

---

## FEE CALCULATION LOGIC

**Payout Agent owns this implementation.**

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

---

## DAILY EARNINGS TABLE

**Schema Agent must add this table.**

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

---

## PAYOUT METHODS VIA DOTS — FEE TABLE

Platform adds arbitrage margin on top of Dots' actual cost. Driver sees net fee. Platform keeps spread.

| Method | Dots Cost (est) | Driver Fee Shown | Platform Arbitrage |
|---|---|---|---|
| Bank / ACH | ~$0.25 | FREE | $0.25 |
| Cash App | ~$0.25 | FREE | $0.25 |
| Venmo | ~$0.25 | FREE | $0.25 |
| Zelle / RTP | ~$0.50 | FREE | $0.50 |
| Debit card | ~1% | 0.5% | 0.5% |
| PayPal | ~1.5% | 1% | 0.5% |

---

## UI RULES

### Payout Methods
Show **"FREE"** for ACH, Cash App, Venmo, Zelle.

Frame: *"Cash App, Venmo, and bank are always free. Other methods may carry a small fee."*

### Ride Earnings Display
**Never show percentage.** Always show two numbers only:

```
You kept:   $17.21
HMU took:   $1.91
```

### Viral Moment — Daily Cap Hit
```
You kept:   $20.00  🔥
HMU took:   $0.00
Daily cap hit — rest of today is ALL yours
```

---

## RIDER OG STATUS

- **Trigger**: 10 completed rides + 0 open disputes → auto-granted
- **Perks**: Read driver comments, priority matching with HMU First drivers
- **Push**: "You're OG now. You can see what drivers really think. 🔥"

---

## CHILL SCORE FORMULA

```
Chill % = ((CHILL count + (Cool AF count × 1.5)) / total ratings) × 100
```

---

## WAIT FEE (NEW — Net-New Schema/UI)

- Driver sets per-minute wait fee in profile, within admin-defined band (default $0.25–$2.00/min, suggested $0.50/min)
- Triggered when rider requests extension at HERE and driver approves
- Added to ride total before capture; rider sees concrete dollar amount in the request prompt

### Admin Config
| Key | Default | Purpose |
|---|---|---|
| `wait_fee_min_per_min` | 0.25 | Min wait fee a driver can set |
| `wait_fee_max_per_min` | 2.00 | Max wait fee a driver can set |
| `wait_fee_suggested_per_min` | 0.50 | Suggested default in driver profile |

---

## KEY TABLES

- `rider_payment_methods` — saved cards
- `price_negotiations` — price proposal tracking
- `transaction_ledger` — full audit trail for all money movement (includes reversals)
- `daily_earnings` — progressive fee tier tracking
- `processed_webhook_events` — Stripe event-id dedup
- `ride_extensions` — extension requests + approvals + wait-fee amounts
- `rides` columns: `price_mode`, `proposed_price`, `final_agreed_price`, payment tracking fields, `cashout_eligible_at` (set when capture succeeds)

---

## RELATED DOCS
- [Payments](./PAYMENTS.md) — Stripe integration, capture flow, reversal mechanics
- [Ride Flow](./RIDE-FLOW.md) — When fees are calculated + captured
- [Schema](./SCHEMA.md) — Full database schema for payment tables
