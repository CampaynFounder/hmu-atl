# RIDE FLOW — HMU ATL

> Ride state machine + realtime channel architecture. Read alongside `docs/PAYMENTS.md` (capture rules) and `docs/SCHEMA.md` (`rides`, `ride_locations`, etc.).

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
POSTED → MATCHED             (taps Pull Up on driver — Stripe PaymentIntent created with manual capture, funds authorized)
MATCHED → LOCATION_SHARED    (shares geo or address — see GPS Sharing copy)
LOCATION_SHARED → BET        (taps BET — heading to car)
BET → CONFIRMING             (driver taps Start Ride — rider sees "I'm In — Pay $X" prompt)
CONFIRMING → IN_RIDE         (rider taps "I'm In" with GPS — capture fires; no silent auto-confirm)
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
3. **Rider-in-car confirmation** — rider sees the "I'm In — Pay $X" button and **must physically tap it**. There is no silent auto-confirm path; deadline expiry leaves the button clickable so the rider can still confirm late, and the driver can pulloff (0% / 25% / 50%) if the rider truly didn't show. Per 2026-05-08 direction: rider tap is the primary chargeback evidence.
4. **GPS captured at tap** — the BET button collects rider lat/lng (`navigator.geolocation`) and the server requires it. Stored in `rides.rider_start_lat` / `rider_start_lng` as supplementary chargeback evidence. If GPS is missing/denied, the API rejects with a clear error and capture does NOT fire.
5. **All passed → capture fires.** Funds move from rider to driver Connect via Destination Charge with `application_fee_amount` set at capture (see `docs/PAYMENTS.md` → STRIPE INTEGRATION).
6. **Cash-out unlocks** for the driver immediately. No platform-side hold beyond this point. (Stripe may impose its own holds — outside our control.)

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
| Rider accepts + pays | "Pull Up" (was "COO" pre-2026-05-07; internal route names like `app/api/rides/[id]/coo/route.ts` retain `coo` to avoid churn) |
| Rider heading to car | "BET" |
| Driver starts the ride | "Start Ride" |
| Rider confirms in car (button label) | "I'm In — Pay $X" |
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
