# HMU ATL — Tech Debt & Open Items

Last updated: 2026-03-23

---

## P0 — Must Fix Before Launch

- [ ] **Clerk webhook → Clerk metadata sync**: Webhook logs Stripe IDs but doesn't sync `stripeAccountId`, `stripeCustomerId` to Clerk `publicMetadata` (app/api/webhooks/clerk/route.ts:104)
- [ ] **Payment flow gate**: Booking accept currently skips payout setup check — re-enable when payment flow is live (app/api/bookings/[postId]/accept/route.ts:21)
- [ ] **Post status cleanup**: When a ride completes/cancels, the associated `hmu_posts` row should update from `matched` → `expired`. Currently stays stale causing phantom "active ride" banners.
- [ ] **Waitlist form backend**: Homepage city waitlist form logs to console only — needs API endpoint or PostHog capture to store signups
- [ ] **TextBee SMS**: Env vars `TEXTBEE_API_KEY` + `TEXTBEE_DEVICE_ID` need to be set in Cloudflare Worker secrets once Android device is configured

## P1 — Important, Not Blocking

- [ ] **Booking decline notification**: No Ably notification fires to rider when driver declines (app/api/bookings/[postId]/decline/route.ts:33)
- [ ] **Rider feed video URLs**: Video URLs not fetched in rider feed API (app/api/feed/riders/route.ts:155)
- [ ] **Rider feed Clerk data**: First name pulled from DB, but avatars/photos need Clerk API or cache (app/api/feed/riders/route.ts:146)
- [ ] **Google Places autocomplete**: Ride request composer has placeholder for address autocomplete, not wired up (components/rides/ride-request-composer.tsx:70)
- [ ] **Messaging modals**: "Message" buttons in driver/rider feeds are stubs (components/feed/driver-feed.tsx:137, rider-feed.tsx:132)
- [ ] **Toast notifications**: Feed actions use alert() or console.log, need proper toast (components/feed/rider-feed.tsx:117)
- [ ] **Driver suggestion flow via Ably**: Data model supports driver suggesting add-ons mid-ride, but UI not built yet
- [ ] **Chat booking add-on fetch**: The add-ons step in chat-booking.tsx fetches from `/api/drivers/${handle}` but needs a dedicated endpoint for the driver's service menu visible to riders

## P2 — Nice to Have

- [ ] **Legacy landing components**: `components/landing/` directory has unused pre-consolidated components (cta-section, footer, hero-section, etc.) — can be deleted
- [ ] **Stash cleanup**: 10 git stashes from agent branches exist locally — stash@{7} (notifications) was saved, rest are superseded
- [ ] **Dots API integration**: Aspirational payout method (Cash App, Venmo, Zelle, PayPal) — blocked on $999/mo API tier. Currently only Stripe Connect for bank/debit payouts.
- [ ] **Price auto-calculator**: `lib/payments/price-calculator.ts` needed for Turf.js distance-based pricing
- [ ] **Real-time financial UI via Ably**: Push payment events to ride channel during active rides
- [ ] **Rider payment UI**: Saved cards add/remove flow (frontend components)
- [ ] **Driver earnings visualization**: Daily/weekly charts (frontend)
- [ ] **Admin dashboard**: Live map, dispute queue, account management, video review queue
- [ ] **Ride scheduling**: Book for tomorrow / recurring rides
- [ ] **Referral system**: $5 credit per referral
- [ ] **SMS → App**: Text "HMU $15 Rides Decatur" → auto-creates post via Twilio webhook

## Schema Items Built But Not Wired to UI

- `price_negotiations` table — price proposal tracking (3 modes: rider proposes, auto-calculated, driver fixed)
- `transaction_ledger` — exists and is written to, but no admin view
- `ride_add_ons` — phase 2 UI built (booking chat + ride end review) but needs real-world testing
- `driver_enrollment_offers` — admin API for creating/managing offers not built (currently seed SQL only)

## Code Quality

- [ ] **Numeric type casting**: Postgres NUMERIC columns return strings — several `.toFixed()` calls needed `Number()` wrapping. May be more instances.
- [ ] **Inline styles vs CSS modules**: Driver share profile, driver settings, ride client all use inline styles. Marketing pages use CSS modules. Consider consolidating.
- [ ] **Error boundaries**: `app/error.tsx` and `app/not-found.tsx` exist but ride/driver/rider pages may need their own
