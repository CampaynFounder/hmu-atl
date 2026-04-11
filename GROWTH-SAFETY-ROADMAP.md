# Growth & Safety Roadmap

Status as of 2026-04-11. This file tracks the multi-PR sequence that started
with the admin growth drill-in + chat abuse hardening work.

---

## Shipped (PR 0 + PR 1)

### PR 0 — Admin growth drill-in (complete)
- Live Ops "new users since last visit" counter with per-admin cursor
  (`users.admin_last_seen_at`)
- Fly-in drill-ins on Live Ops and the Growth tab (`app/admin/components/new-users-sheet.tsx`,
  `app/admin/components/growth-drill-in-sheet.tsx`, `app/admin/components/admin-sheet.tsx`)
- Signup attribution: `users.signup_source`, `users.referred_by_driver_id`,
  `users.referred_via_hmu_post_id` — populated from Clerk `unsafeMetadata` in
  the webhook flow (gated on phone verification so unverified = bot)
- Admin SMS audit: `admin_sms_sent` table + `lib/admin/sms.ts` batch lookup,
  surfaces "texted Y/N + date" in drill-ins, sorts never-texted first
- `rider_profiles.phone` cache column + `scripts/backfill-phones-from-clerk.ts`
- Reader-narrowing: `getUserByClerkId` / `getUserById` now select explicit
  columns and no longer leak attribution fields. `getUserAttribution()` for
  admin-only reads.

### PR 1 — Chat booking auth + rate limits + suspect-usage admin (complete)
- New tables: `rate_limit_counters` (atomic UPSERT), `suspect_usage_events`
- `lib/rate-limit/check.ts` — Neon-backed rolling window counter that works on
  Cloudflare Workers (unlike the in-memory Map still used in
  `lib/rides/matching.ts` — see open TODO below)
- `lib/admin/suspect-events.ts` — `logSuspectEvent` + `getSuspectUsageSummary`
- `/api/chat/booking` now requires Clerk auth and enforces:
  - 30 chat messages / user / hour
  - 5 booking conversions (`confirm_details`) / user / hour
  - 2 booking conversions / rider–driver pair / 24h
  - 403 + `driver_booking_self_via_ui` audit event if the caller's Neon user_id
    matches the driver behind the handle
- `/api/drivers/[handle]/book` now has a `rider.id !== driverUserId` structural
  self-booking guard with `self_booking_attempt` audit event
- `app/d/[handle]/driver-share-profile-client.tsx` — HMU button click now reads
  `/api/users/me` (extended to return `driverHandle`), branches to
  `DriverBlockerModal` on the two driver variants (own handle / other driver)
  instead of opening chat
- Old in-chat "You're signed in as a driver…" warning in `gpt-chat-booking.tsx`
  is deleted
- `/admin/suspect-usage` read-only table with 1/7/30 day filter, added to the
  sidebar under ACT

---

## PR 2 — Dual-role account (active_role switching)

### Problem
One Clerk user = one phone = one identity. Forcing drivers to create a second
account with a different phone to use rider features is:
1. Hostile to the real customer base (driver who rents cars sometimes needs a
   ride too) and
2. Pushes users toward Google Voice / burner numbers, which degrades the
   phone-verification gate we just shipped.

The real product intent — visible in the leftover `'both'` handling at
`app/api/users/onboarding/route.ts:70` — has always been dual-role. PR 1 papered
over this with a soft blocker modal; PR 2 is the actual fix.

### Scope
1. **Schema:** add `users.active_role` (`'rider' | 'driver'`), default = `profile_type`.
   At most one role is active at a time.
2. **Identity model:** "profile_type" becomes vestigial for UX purposes. The
   source of truth for "am I a rider right now?" is `active_role`. The source
   of truth for "do I have a rider profile?" is the existence of a
   `rider_profiles` row (same for driver).
3. **Role switch API:** `POST /api/users/active-role { role }` flips
   `users.active_role`, returns fresh user object. Protected — only switches to
   roles the user actually has a profile for.
4. **Onboarding extension:** accept `?type=rider&prefill=1` on `/onboarding` to
   pre-fill first/last/phone from an existing driver profile, skipping fields
   that don't need re-asking. Similar for `?type=driver&prefill=1`.
5. **Streamlined add-rider path:** from the driver blocker modal on
   `/d/[handle]`, replace "Browse drivers" with "Add rider profile" (primary)
   + "Browse drivers" (secondary). The add-rider button links to
   `/onboarding?type=rider&prefill=1&returnTo=/d/<handle>`.
6. **Session role flip:** on first open of a driver-held `/d/[handle]` after
   they already have a rider profile, driver blocker becomes
   "Switch to rider mode and book?" → POST to `/api/users/active-role` →
   reload current page → chat opens as rider.
7. **Guards + middleware:** every `requireRole(['rider'])` / `requireRole(['driver'])`
   call in `lib/auth/guards.ts` branches on `active_role`, not `profile_type`.
   Full audit of consumers needed — see the PR 0 audit notes in
   `lib/auth/guards.ts` comments and `lib/admin/helpers.ts`.
8. **Header mode indicator:** always show current mode in the app header with a
   one-tap switch affordance (if the user has both profiles).
9. **Booking create guards (already in PR 1):** `rider.id !== driverUserId`
   check is already in place — no change needed, it already handles dual-role
   correctly.

### Files likely to touch
- `lib/db/migrations/active-role.sql` (new)
- `lib/db/types.ts` — add `'both'` / revise `ProfileType` semantics
- `lib/db/users.ts` — `getUserByClerkId` returns `active_role`; new `setActiveRole()`
- `lib/auth/guards.ts` — branch on `active_role` instead of `profile_type`
- `lib/admin/helpers.ts` — same
- `app/api/users/me/route.ts` — return `activeRole` + `hasRiderProfile` + `hasDriverProfile`
- `app/api/users/active-role/route.ts` (new) — POST handler
- `app/api/users/onboarding/route.ts` — accept `prefill=1`, pre-fill from other profile
- `app/d/[handle]/driver-blocker-modal.tsx` — replace copy + CTAs, add "Switch to rider mode" variant
- `app/d/[handle]/driver-share-profile-client.tsx` — branch the modal variant based on whether they have a rider profile
- `components/layout/header.tsx` — mode indicator + switch button
- Every route handler that reads `profile_type` for authorization (grep for
  `profile_type\s*=\s*'(rider|driver)'` — there are ~5 files per PR 0 audit)

### Out of scope for PR 2
- Self-booking guards (already in PR 1)
- Rate limits (already in PR 1)
- Cancel-rate tracking (see PR 3)

### Resume prompt for PR 2

> Resume PR 2 (dual-role) from GROWTH-SAFETY-ROADMAP.md. Start with the
> `lib/db/migrations/active-role.sql` migration (add `users.active_role` defaulting
> to `profile_type`). Before writing any UI, audit every call site of
> `requireRole` in `lib/auth/guards.ts` and `requireAdmin` in
> `lib/admin/helpers.ts` and every SQL `WHERE profile_type` filter — report
> which ones need to branch on `active_role` instead. Then design the role
> switch flow end-to-end before touching code: what happens when a driver flips
> to rider mode mid-ride, mid-booking request, mid-chat? Can they accept a new
> ride in driver mode while their rider-mode booking is still pending? Pause
> after the audit + design writeup and wait for my approval before building.
> The `rider.id !== driverUserId` guard in `app/api/drivers/[handle]/book/route.ts`
> already exists from PR 1 — don't duplicate it.

---

## PR 3 — Cancel-rate tracking and auto-suspend

### Recommendation: SPLIT. Ship the data collection now, defer automation.

### Why I'm cautious about the full version
1. **No threshold data.** "Good" cancel rate for peer-to-peer Metro Atlanta
   rides is unknown. Picking a number without data auto-suspends legit users
   or does nothing.
2. **Attribution is ambiguous.** Cancel fault needs to be assigned correctly
   (rider changed plans vs driver no-showed vs unreasonable pickup). Getting
   it wrong compounds threshold errors.
3. **Cold-start math.** New user's first cancel is a 100% rate. Needs
   minimum-ride guards that need more tuning.
4. **Auto-suspension is high-stakes.** Account termination without human
   review has legal + reputational cost. Need appeals workflow + admin UI +
   escalation paths.
5. **PR 1 already gives visibility.** `/admin/suspect-usage` exists. Watch it
   for 2–4 weeks before building the automated response.

### PR 3a — Cancellation data collection (recommended immediately)
- New table `ride_cancellations (id, ride_id, cancelled_by_user_id, cancelled_by_role, reason_code, notes, fault_assigned_to, created_at)`
- Populate from every cancel path (rider-side, driver-side, auto-expire, admin-side)
- `reason_code` enum: `rider_changed_plans`, `driver_no_show`, `rider_no_show`,
  `pickup_unreachable`, `payment_failed`, `dispute_filed`, `other`
- `fault_assigned_to` default NULL (pending review) or set by the cancel handler
  when unambiguous
- Admin surface: add a "Cancellations" tab to `/admin/money` or a new
  `/admin/cancellations` page showing rolling daily cancel count + rate
- **No automated action.** Data collection only. Admin reviews manually and can
  escalate to user profile page.

### PR 3b — Rate-based auto-suspend (DEFERRED, revisit after 2–4 weeks of PR 3a data)
- `user_cancel_stats` rollup (or computed view)
- Threshold config per-role: `rider_cancel_threshold`, `driver_no_show_threshold`,
  minimum sample size before thresholds apply (e.g. 10 rides)
- Auto-suspend writes `suspect_usage_events` + sets `account_status='suspended'`
  + sends notification to user with appeal link
- Appeals workflow: new admin queue, review UI, restore action, audit log
- Gate auto-suspend behind a feature flag so it can be turned off instantly

### Files likely to touch (PR 3a, the safe part)
- `lib/db/migrations/cancellation-logging.sql` (new)
- `lib/db/cancellations.ts` (new) — single write path
- Every cancel handler (grep for `status = 'cancelled'` / `cancelRide` /
  `cancel_booking` / `UPDATE hmu_posts SET status = 'cancelled'`)
- `app/admin/cancellations/page.tsx` (new) — admin review surface
- `app/api/admin/cancellations/route.ts` (new)

### Resume prompt for PR 3

> Resume PR 3 from GROWTH-SAFETY-ROADMAP.md. Only build PR 3a (data collection)
> unless I've explicitly told you to do PR 3b. Before writing any code, grep
> the codebase for every cancellation write path (`UPDATE rides SET status =
> 'cancelled'`, `UPDATE hmu_posts SET status = 'cancelled'`, and any
> `cancelRide` / `cancelBooking` helpers) and report them as a list. Also
> check `app/api/bookings/[postId]/decline/route.ts` and
> `lib/db/direct-bookings.ts`. Then design the schema + the single write path
> `lib/db/cancellations.ts` so every existing cancel handler becomes a one-line
> call. Pause after the audit and wait for my approval before touching code.
> If I ask for PR 3b later, the appeals workflow must be designed before any
> auto-suspend logic is written — suspend-without-appeal is not acceptable.

---

## Unshipped / parked ideas

### Driver preview mode + agent fine-tuning
Discussed as part of PR 1 design, deferred. The concept: let a driver visit
their own `/d/[handle]` and chat their own GPT agent in preview mode (no
booking), with a `driver_profiles.agent_instructions` text field they can
edit on their profile settings. The agent appends these instructions to the
system prompt when chatting for that driver. Driver uses preview mode to
test + tune. Phase 2 would add a GPT eval loop.

Revisit after PR 2 ships (dual-role makes the "preview mode" question easier —
driver in preview mode is just driver in driver `active_role` on their own
handle).

### Rider thumbnail gallery after Clerk auth (conversion lever)
Proposed during PR 0 discussion. Concept: after a prospective driver verifies
their Clerk account but before they finish onboarding, show a gallery of real
rider profile thumbnails with location + request snippet ("needs a ride to
Hartsfield-Jackson, $22") as social proof, with the auth wall replaced by a
specific interaction ("HMU this rider" → finish onboarding). A/B test against
the current straight-to-onboarding flow.

Not built. Would live behind a feature flag and require an A/B test harness.

### Fix the in-memory rate limiter in `lib/rides/matching.ts`
The existing rate limiter at `lib/rides/matching.ts:200-222` uses a
process-level `Map`. On Cloudflare Workers this is per-isolate and silently
broken — the limit is effectively per-request, not per-user. PR 1 built
`lib/rate-limit/check.ts` specifically to avoid this. Swap the rides matcher
to use `checkRateLimit()` with key space `rides:match:<riderId>`. ~10 line
change. Pre-existing bug, not introduced by PR 1 — but on the same theme so
worth sweeping in a follow-up.

### Admin SMS recipient resolution
`/api/admin/marketing/send/route.ts` currently accepts optional `userId` on
each Recipient, falling back to a `phone`-based lookup in `resolveUserIdByPhone`.
All existing callers still send `phone` without `userId`, so every admin SMS
incurs a DB lookup. Low priority, but when we next touch admin SMS UIs, pass
`userId` explicitly from the user row so the audit log gets written
synchronously without the lookup.

---

## Open TODOs by area (for spot sweeps)

- [ ] Swap `lib/rides/matching.ts` rate limiter to use `lib/rate-limit/check.ts`
- [ ] Audit `/api/rider/[handle]/route.ts` and similar public-ish rider endpoints
      for `phone` column leakage (PR 0 added the column — existing routes
      explicitly pick columns so they're safe, but any new route that uses
      `SELECT *` from `rider_profiles` will leak it)
- [ ] Run `scripts/backfill-phones-from-clerk.ts` in production to populate
      existing users' phone cache
- [ ] Decide whether "incomplete signups" bucket on Live Ops should eventually
      split by intended role (currently shows combined — the split requires
      `unsafeMetadata.intent` to be read on `user.created` webhook and stashed
      somewhere, which it currently isn't since we gate row creation on phone
      verification)
