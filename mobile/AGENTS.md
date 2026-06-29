# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Booking-flow invariants (READ before touching `app/(rider)/book/*`)

These have each regressed before. They are enforced in code — do not weaken them.

## Direct booking: a pre-selected driver skips "SELECT YOUR DRIVER"
`book/direct.tsx` arrives from Browse's HMU button with a `prefillHandle` param,
meaning **the rider already chose their driver**. Step 0 ("SELECT YOUR DRIVER")
is ONLY for manual handle search (no prefill). Therefore:

- When `prefillHandle` is set, step 0 must be **unreachable**.
- This is enforced by `minStep = prefillHandle ? 1 : 0` and a `goToStep` clamp —
  ALL step changes go through `goToStep`, never raw `setStep`. The draft-resume
  path (`applyDraft`) and back nav both rely on this; a stale step-0 draft must
  never bounce a prefilled rider back to driver search.
- If you add a new way to change the step, route it through `goToStep`. If you
  add a new entry point with a pre-selected driver, give it `prefillHandle`.
- **The prefill must be REACTIVE to the param, never mount-timing-dependent.**
  `useLocalSearchParams()` can return empty on the first render(s), so
  `useState(minStep)` may capture `step=0` before `prefillHandle` hydrates. A
  mount-only effect (`[]` deps) then misses it entirely → the rider is stranded
  on step 0. The fix (do not remove): an effect keyed on `[prefillHandle]` that
  enforces the step floor (`setStepRaw(s => Math.max(1, s))`), fills the handle,
  and loads the driver — idempotent via `!driver && !findingDriver` guards.

Regression history: the "reorder direct booking" + "back-out drafts" PRs each
re-broke this by restoring/advancing the step without honoring the prefill; a
later regression stranded prefilled riders on step 0 because the prefill effect
read `prefillHandle` only at mount, before the route params had hydrated.

## Network calls must never hang the UI
`lib/api.ts` `apiClient` has a 30s `AbortController` timeout. Without it a hung
origin (Neon stall, CF holding the socket) leaves a submit button spinning
forever. Keep the timeout; do not strip the signal when adding fetch options.

## A cancelled ride must never bleed into a rebooking
Every booking is a fresh `rides` row (new UUID); cancellation is an in-place
`UPDATE ... WHERE id = rideId` on that one row; `/api/rides/active` whitelists
live statuses and excludes `cancelled`. So the **DB is the source of truth and is
always right** — the failure mode is the realtime layer, not storage.

- A `status_change`/`cancelled` Ably event can be a **rewind replay** (2-min
  window) or a stale cancel for a ride the rider just **rebooked within seconds**.
  Never render a destructive "RIDE CANCELLED" surface straight from the event.
- **Scope cancel events by `rideId` and reconcile against `/api/rides/active`**
  before showing them: if the rider's *current* active ride is a different
  `rideId`, the cancel is for a superseded ride — suppress it. A time-based age
  gate alone CANNOT catch immediate rebooking; identity reconciliation can.
- Web enforces this in `components/global-ride-alert.tsx` (the `status === 'cancelled'`
  branch). Mobile realtime handlers (`contexts/notifications.tsx`,
  `app/(rider)/ride/active.tsx`) must follow the same rule.
- DB backstop: `uq_one_active_ride_per_rider` (migration
  `2026-06-22-one-active-ride-per-rider.sql`) makes two simultaneous live rides
  per rider impossible, so the `active` lookup can never be ambiguous.

## The notify channel is keyed on the DB user id, NEVER the Clerk id
The server publishes every ride/booking event to `user:{users.id}:notify` (the
Neon `users.id` UUID), via `notifyUser(dbUserId, …)`. The mobile app only holds
the Clerk id client-side, so it MUST resolve its DB id first (`GET /users/me` →
`data.id`) and subscribe to `user:{dbUserId}:notify` (`contexts/notifications.tsx`).

- Subscribing with the Clerk id is silently dead: the Ably token grants the
  capability for both id channels, but capability ≠ delivery — nothing is ever
  published to the Clerk-id channel. The symptom is total: NO app-wide request
  banners, NO backstop ride refresh, NO wallet refresh, status updates that only
  land via the per-screen `ride:{id}` channel. Web has always done this right
  (`internalUserId` from `/api/users/me`).
- A foreground OS push is NOT proof the in-app channel works — the push half and
  the Ably half of `notifyUserWithPush` are independent. Verify the in-app banner.

## A driver must learn of a new request from ANY screen, not just the feed
Background-received requests never reach the in-app Ably handler (JS suspended),
and a 12s toast is missable. So new-request surfacing has TWO layers, both
required: the transient `NotificationBanner` (realtime, foreground) AND the
persistent `PendingRequestBar` (server-authoritative `GET /drivers/requests`,
refreshed on mount/route-change/foreground). Never rely on the toast alone.

## Market is assigned at sign-up via Clerk unsafeMetadata, BEFORE signUp.create
`app/(auth)/sign-up.tsx` resolves the device's market (`lib/market.ts` →
`GET /api/public/market-check`, a PUBLIC endpoint, called with a `null` token
because there is no session yet) and passes `unsafeMetadata: { market: slug }`
into `signUp.create()`. This is the ONLY reliable way to set `users.market_id`:
the Clerk webhook creates the Neon row at phone-verification and reads
`unsafe_metadata.market`; once it writes a non-null `market_id`, the later
`COALESCE(market_id, …)` heal paths can NEVER overwrite it. So:

- The market MUST be resolved before `signUp.create`, not after. Resolving it
  post-session (header/PATCH) is too late — the row is already born as the
  default market (`atl`). This bug is INVISIBLE in Atlanta; it only shows up as
  NOLA/other-market users stuck in the ATL market.
- Sign-up is gated to live markets here: if `market.isActive === false`, route to
  `/not-in-market` and do NOT create the account (until national rollout).
- Fails OPEN when location is denied/unavailable (and is skipped in `__DEV__`) —
  the authed launch-time gate in `app/index.tsx` still applies on next open.
- `not-in-market.tsx` is reached both pre-session (sign-up gate) and post-session
  (launch gate); its actions branch on `isSignedIn`. Don't assume a session.
- Geo→market centers live server-side in `lib/markets/geo.ts` (shared by the
  authed `active-check` and the public `market-check`); `middleware.ts` keeps its
  own edge copy. Adding a market means updating both.

## Ride status uses TWO Ably event shapes — handle both on the client
`ride:{id}` carries `status_change` for most transitions, BUT the rider's
Start-Ride step arrives as its OWN event name `confirm_start` (with
`confirmDeadline`), not a `status_change`. The rider screen MUST handle
`confirm_start` → enter `confirming` → show the I'M IN CTA; without it the rider
can never confirm and the ride strands at `confirming` (driver hangs on
"RIDER CONFIRMING…"). Mirrors web `active-ride-client.tsx`.

## A finished ride must CLEAR — never re-prompt rating, never hang the live bar
Two separate states have to wind down when a ride ends, or the driver gets stuck
(both regressed once → the rating sheet looped and the "YOUR RIDE IS LIVE" bar
hung until an app reload):

- **Rating prompt is for `ended`, NOT `completed`.** Submitting a rating moves a
  ride `ended → completed`, so opening the rating sheet on `completed` re-prompts
  every time the driver re-enters `(driver)/ride/active` (e.g. via the live bar)
  — an infinite "rate" loop. Auto-open the sheet ONLY on a fresh `ended` status
  (`fetchRide` + the `status_change` handler). `completed` is finalized: never
  re-prompt. (`stopRideTracking` still runs for both.)
- **The app-wide `activeRide` must be reconciled on any terminal status.** The
  ride screen mutates its LOCAL `ride`, not the context `activeRide` that drives
  `ActiveRideBar` ("YOUR RIDE IS LIVE"), and the party who ends the ride does not
  reliably receive a notify for their OWN end. So the screen MUST call
  `refreshActiveRide()` whenever its ride reaches `ended`/`completed`/`cancelled`
  — that re-pulls `/rides/active` (which excludes those statuses via
  `LIVE_RIDE_STATUSES`) and clears the bar. Without it the bar hangs until a
  reload. Keep this on both driver and rider active screens.
