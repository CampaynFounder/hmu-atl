# Payment Capture Scenarios

How money moves on HMU ATL, in plain language. Source of truth for marketing copy,
support responses, and rider/driver education.

All non-cash rides place a single authorization hold on the rider's card when the
driver accepts the booking. Nothing is captured until one of the five scenarios
below resolves. Implementation lives in `lib/payments/escrow.ts`.

---

## 1. Ride completes (happy path)

**When:** Driver taps End Ride, dispute window closes clean.

**What's captured:** The full agreed price plus any confirmed add-ons.
If add-ons were dropped during the ride, the unused reserve is released.

**Who gets what:**
- Driver receives the ride amount minus HMU's platform fee (progressive by
  daily earnings tier; zero when driver is inside the Launch Offer free window).
- HMU takes its platform fee as an application fee on the capture.
- Stripe's processing fee is absorbed by the driver's connected account.

**Rider sees:** One charge for the ride price. No separate fees.

**Marketing angle:** *"You pay what you agreed. No surge. No surprise fees."*

---

## 2. Rider no-shows at pickup

**When:** Driver arrives, waits the configured window, then taps No Show.

**Non-cash rides** — partial capture of the base fare, add-on reserve released
in full:

| Trigger | Rider charged | Driver gets | HMU gets | Rider refund |
|---|---|---|---|---|
| 25% no-show | 30% of base | 25% of base | 5% of base | 70% of base + all add-ons |
| 50% no-show | 60% of base | 50% of base | 10% of base | 40% of base + all add-ons |

**Cash rides:** No charge. Ride is cancelled, no money moves.

**Marketing angle:** *"Driver shows up, you don't, they still get paid. Gas money
comes out of your hold — not the full fare."*

> The no-show charge is a **percentage of the agreed fare**, not the visible
> deposit amount. The deposit column is used only in scenario 3.

---

## 3. Rider cancels after driver is OTW

**When:** Rider cancels after the driver has tapped OTW and started driving.

**What's captured:** Only the visible deposit split, configured per tier in
`hold_policy` (e.g. driver keeps X%, platform keeps Y%, rider refunded the
remainder of the deposit). The rest of the hold is released.

**Who gets what:**
- Driver gets the "gas money" share of the deposit.
- HMU takes a small platform share.
- Rider is refunded any deposit amount above the split.

**Marketing angle:** *"Change your mind after the driver's already rolling? A
small deposit covers their time — the rest goes back on your card."*

---

## 4. Cancel before OTW / driver ghosts

**When:** Ride never leaves `matched`, driver doesn't tap OTW within 30 min,
or admin aborts.

**What's captured:** $0. Full authorization released.

**Rider sees:** Hold drops off their card (typically 1–7 days depending on
issuer).

**Marketing angle:** *"No driver shows up? You pay nothing."*

---

## 5. Post-completion refund (dispute or admin reversal)

**When:** Dispute resolved in rider's favor within the 45-minute window, or
admin reverses a completed ride.

**What happens:**
- If the ride was never captured → hold released (scenario 4 path).
- If already captured → full refund issued via Stripe.

**Marketing angle:** *"Something went wrong? Say something within 45 minutes.
We make it right."*

---

## Summary table

| Scenario | Trigger | Driver paid | Platform paid | Rider charged |
|---|---|---|---|---|
| Ride completes | End Ride, clean window | Full minus fee | Platform fee | Full agreed price |
| No-show 25% | Driver taps No Show | 25% of base | 5% of base | 30% of base |
| No-show 50% | Driver taps No Show | 50% of base | 10% of base | 60% of base |
| Cancel after OTW | Rider cancels post-OTW | Deposit share | Deposit share | Deposit only |
| Cancel before OTW | Rider/driver/system abort | $0 | $0 | $0 |
| Post-completion refund | Dispute for rider | Reversed | Reversed | Refunded in full |

---

## What to say on marketing pages

Use this shortlist of promises:

1. **"Your card is held, not charged, until the ride's done."** (covers 1–4)
2. **"No driver, no charge."** (scenario 4)
3. **"No-show? A small fee covers the driver's time — not the full ride."** (scenario 2)
4. **"Cancel before your driver's on the way — full refund, no questions."** (scenario 4)
5. **"Something off? 45 minutes to dispute."** (scenario 5)
