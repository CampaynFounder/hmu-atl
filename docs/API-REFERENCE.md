# HMU ATL — API Reference

> Auto-generated on 2026-04-13 by `scripts/generate-api-docs.ts`
> Re-run: `npx tsx scripts/generate-api-docs.ts`

---

## Summary

| Metric | Count |
|---|---|
| Total routes | 140 |
| Auth-protected | 86 |
| Admin-only | 45 |
| Public (no auth) | 54 |

## Table of Contents

- [Ably](#ably) (1 routes)
- [Admin](#admin) (46 routes)
- [Bookings](#bookings) (3 routes)
- [Chat](#chat) (2 routes)
- [Data Room](#data-room) (4 routes)
- [Driver](#driver) (20 routes)
- [Drivers (Public)](#drivers-public-) (8 routes)
- [Feed](#feed) (1 routes)
- [Other](#other) (4 routes)
- [Payments](#payments) (2 routes)
- [Rider](#rider) (7 routes)
- [Rides](#rides) (30 routes)
- [Search](#search) (1 routes)
- [Upload](#upload) (1 routes)
- [Users](#users) (7 routes)
- [Webhooks](#webhooks) (3 routes)

---

## Ably

### `POST` `/api/ably/token` `ADMIN`

**File:** `app/api/ably/token/route.ts`

**Request body:**
```
  rideId
```

**Status codes:** 200, 401, 404, 500

---

## Admin

### `GET` `/api/admin/alerts` `ADMIN`

**File:** `app/api/admin/alerts/route.ts`

**Response fields:** `alerts`

**Status codes:** 200

---

### `GET` `PATCH` `/api/admin/chill-config` `AUTH`

**File:** `app/api/admin/chill-config/route.ts`

**Request body:**
```
  profile_type: string
```

**Status codes:** 200, 401, 403

---

### `POST` `/api/admin/content/generate` `ADMIN`

**File:** `app/api/admin/content/generate/route.ts`

**Response fields:** `trend-hijack`, `or hook-only.'`

**Status codes:** 200, 400, 500

---

### `GET` `POST` `PATCH` `DELETE` `/api/admin/content/prompts` `ADMIN`

List saved prompts

**File:** `app/api/admin/content/prompts/route.ts`

**Request body:**
```
  id
  inputs
  fullText
  narration
  notes
  status
```

**Response fields:** `prompts`

**Status codes:** 200, 400

---

### `GET` `/api/admin/data-room/consents` `ADMIN`

**File:** `app/api/admin/data-room/consents/route.ts`

**Response fields:** `consents`

**Status codes:** 200, 500

---

### `GET` `/api/admin/data-room/consents/:id` `ADMIN`

**File:** `app/api/admin/data-room/consents/[id]/route.ts`

**Status codes:** 200, 404, 500

---

### `GET` `/api/admin/data-room/consents/export` `ADMIN`

**File:** `app/api/admin/data-room/consents/export/route.ts`

**Status codes:** 200, 500

---

### `GET` `/api/admin/data-room/documents` `ADMIN`

**File:** `app/api/admin/data-room/documents/route.ts`

**Response fields:** `documents`

**Status codes:** 200, 500

---

### `PATCH` `DELETE` `/api/admin/data-room/documents/:id` `ADMIN`

**File:** `app/api/admin/data-room/documents/[id]/route.ts`

**Request body:**
```
  name
  description
  category
```

**Status codes:** 200, 400, 404, 500

---

### `POST` `/api/admin/data-room/documents/upload` `ADMIN`

**File:** `app/api/admin/data-room/documents/upload/route.ts`

**Request body:**
```
  MEDIA_BUCKET: { put: (key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string
```

**Response fields:** `name`, `and category are required'`

**Status codes:** 200, 400, 500

---

### `GET` `/api/admin/data-room/logs` `ADMIN`

**File:** `app/api/admin/data-room/logs/route.ts`

**Response fields:** `logs`

**Status codes:** 200, 500

---

### `GET` `PATCH` `/api/admin/disputes` `ADMIN`

**File:** `app/api/admin/disputes/route.ts`

**Request body:**
```
  disputeId
  action
  notes
```

**Status codes:** 200, 400, 404

---

### `GET` `/api/admin/disputes/:id` `ADMIN`

**File:** `app/api/admin/disputes/[id]/route.ts`

**Status codes:** 200, 404

---

### `POST` `/api/admin/disputes/:id/analyze` `ADMIN`

**File:** `app/api/admin/disputes/[id]/analyze/route.ts`

**Status codes:** 200, 404

---

### `GET` `/api/admin/drilldown` `ADMIN`

**File:** `app/api/admin/drilldown/route.ts`

**Status codes:** 200, 400

---

### `POST` `/api/admin/grant` `ADMIN`

**File:** `app/api/admin/grant/route.ts`

**Request body:**
```
  userId
  grant
```

**Status codes:** 200, 400, 404

---

### `GET` `POST` `/api/admin/hold-policy` `ADMIN`

GET — fetch all hold policies (active + history)

**File:** `app/api/admin/hold-policy/route.ts`

**Request body:**
```
  tier: string
  holdMode: string
  holdPercent: number | null
  holdFixed: number | null
  holdMinimum: number
  cancelBeforeOtwRefundPct: number
  cancelAfterOtwDriverPct: number
  cancelAfterOtwPlatformPct: number
  noShowPlatformTiers: unknown[]
  effectiveFrom: string
  effectiveTo: string
  changeReason: string
```

**Status codes:** 200, 400

---

### `GET` `/api/admin/leads` `ADMIN`

**File:** `app/api/admin/leads/route.ts`

**Status codes:** 200, 401, 403, 500

---

### `POST` `/api/admin/marketing/send` `ADMIN`

**File:** `app/api/admin/marketing/send/route.ts`

**Request body:**
```
  recipients
  message
  link
```

**Status codes:** 200, 400, 500

---

### `GET` `/api/admin/markets` `ADMIN`

**File:** `app/api/admin/markets/route.ts`

**Status codes:** 200, 403

---

### `GET` `PATCH` `/api/admin/messages` `ADMIN`

PATCH — mark all as read for a phone

**File:** `app/api/admin/messages/route.ts`

**Request body:**
```
  phone
```

**Response fields:** `phone`, `userName`, `userType`, `userId`, `messages`

**Status codes:** 200, 400

---

### `GET` `/api/admin/messages/unread` `ADMIN`

**File:** `app/api/admin/messages/unread/route.ts`

**Response fields:** `unread`

**Status codes:** 200

---

### `GET` `/api/admin/money` `ADMIN`

**File:** `app/api/admin/money/route.ts`

**Response fields:** `metrics`, `platformRevenue`, `feesWaived`, `stripeFees`, `profit`, `margin`, `driverPayouts`, `totalRides`, `failedCaptures`, `cashRides`, `cashGmv`, `refundsCount`, `refundsSum`

**Status codes:** 200

---

### `GET` `/api/admin/money/ledger` `ADMIN`

**File:** `app/api/admin/money/ledger/route.ts`

**Status codes:** 200, 500

---

### `GET` `PATCH` `/api/admin/notifications` `ADMIN`

GET — fetch all notification configs

**File:** `app/api/admin/notifications/route.ts`

**Request body:**
```
  type
  enabled
  adminPhone
  excludedUserIds
  signupAfter
  excludeBefore
```

**Response fields:** `configs`, `unknown>) => ({
      type`, `enabled`, `adminPhone`, `excludedUserIds`, `signupAfter`, `excludeBefore`, `updatedAt`

**Status codes:** 200, 400

---

### `GET` `POST` `DELETE` `/api/admin/pitch-videos` `AUTH`

GET — list all pitch videos in R2

**File:** `app/api/admin/pitch-videos/route.ts`

**Status codes:** 200, 400, 401, 500

---

### `GET` `POST` `/api/admin/pricing` `ADMIN`

GET — fetch all pricing configs (active + history)

**File:** `app/api/admin/pricing/route.ts`

**Request body:**
```
  tier
  feeRate
  dailyCap
  weeklyCap
  progressiveThresholds
  peakMultiplier
  peakLabel
  effectiveFrom
  effectiveTo
  changeReason
```

**Status codes:** 200, 400

---

### `POST` `/api/admin/refund-pi` `ADMIN`

POST — Admin refunds a PaymentIntent on a connected account. Body: { paymentIntentId, stripeAccountId, reason? }

**File:** `app/api/admin/refund-pi/route.ts`

**Request body:**
```
  paymentIntentId
  stripeAccountId
  reason
```

**Status codes:** 200, 400, 403, 500

---

### `GET` `/api/admin/rides/active` `ADMIN`

**File:** `app/api/admin/rides/active/route.ts`

**Status codes:** 200

---

### `GET` `/api/admin/rides/history` `ADMIN`

**File:** `app/api/admin/rides/history/route.ts`

**Response fields:** `rides`, `unknown>) => ({
      id`, `refCode`, `status`, `pickupLat`, `pickupLng`, `dropoffLat`, `dropoffLng`, `price`, `createdAt`

**Status codes:** 200

---

### `GET` `/api/admin/schedule-analytics` `ADMIN`

GET /api/admin/schedule-analytics?marketId=xxx&period=7d Returns: - Driver utilization (% of working hours booked) - Peak hours heatmap (hour × day bookings) - Advance booking rate (% booked >1hr ahea

**File:** `app/api/admin/schedule-analytics/route.ts`

**Response fields:** `period`, `since`

**Status codes:** 200, 500

---

### `GET` `/api/admin/stats` `ADMIN`

**File:** `app/api/admin/stats/route.ts`

**Response fields:** `rides`, `active`, `completed`, `cancelled`, `disputed`, `total`

**Status codes:** 200

---

### `GET` `/api/admin/suspect-usage` `ADMIN`

**File:** `app/api/admin/suspect-usage/route.ts`

**Response fields:** `days`, `users`

**Status codes:** 200

---

### `GET` `POST` `/api/admin/switch-role` `ADMIN`

**File:** `app/api/admin/switch-role/route.ts`

**Request body:**
```
  role
```

**Status codes:** 200, 400, 401, 403, 404

---

### `GET` `PATCH` `DELETE` `/api/admin/users` `ADMIN`

GET /api/admin/users — list users with optional search ?search=name&type=driver|rider&status=active|suspended

**File:** `app/api/admin/users/route.ts`

**Request body:**
```
  userId
  action
```

**Response fields:** `users`

**Status codes:** 200, 400, 404, 500

---

### `GET` `PATCH` `/api/admin/users/:id` `ADMIN`

**File:** `app/api/admin/users/[id]/route.ts`

**Request body:**
```
  accountStatus
  tier
  ogStatus
  chillScore
  adminNotes
```

**Status codes:** 200, 404

---

### `POST` `/api/admin/users/delete` `ADMIN`

POST /api/admin/users/delete Delete one or more incomplete/abandoned users from both Clerk and Neon. Safety: only deletes users in pending_activation status with 0 completed rides.

**File:** `app/api/admin/users/delete/route.ts`

**Request body:**
```
  userIds
```

**Status codes:** 200, 400, 500

---

### `GET` `/api/admin/users/growth` `ADMIN`

**File:** `app/api/admin/users/growth/route.ts`

**Response fields:** `growth`, `unknown>) => ({
        bucket`, `riders`, `drivers`, `other`, `total`

**Status codes:** 200, 500

---

### `GET` `/api/admin/users/growth/list` `ADMIN`

**File:** `app/api/admin/users/growth/list/route.ts`

**Status codes:** 200, 400

---

### `GET` `POST` `/api/admin/users/new-since` `ADMIN`

**File:** `app/api/admin/users/new-since/route.ts`

**Request body:**
```
  new_riders: number
```

**Response fields:** `lastSeenAt`, `newUsers`, `drivers`, `total`

**Status codes:** 200, 400

---

### `GET` `PATCH` `/api/admin/users/pending` `ADMIN`

**File:** `app/api/admin/users/pending/route.ts`

**Request body:**
```
  userId
  action
  rejectReason
```

**Response fields:** `pending`, `unknown>) => ({
      id`, `clerkId`, `name`

**Status codes:** 200, 400, 404

---

### `GET` `/api/admin/users/recent` `ADMIN`

**File:** `app/api/admin/users/recent/route.ts`

**Response fields:** `signups`, `unknown>) => ({
        id`, `name`, `phone`, `profileType`, `accountStatus`, `handle`, `createdAt`

**Status codes:** 200, 500

---

### `GET` `POST` `/api/admin/videos` `ADMIN`

**File:** `app/api/admin/videos/route.ts`

**Request body:**
```
  compositionId
  title
  recordingFile
  introTitle
  introSec
  videoSec
  endSec
  titleCardDurationSec
  captionDurationSec
  endTagline
  endCta
  steps
```

**Status codes:** 200, 201, 400, 401

---

### `GET` `PUT` `DELETE` `/api/admin/videos/:id` `ADMIN`

**File:** `app/api/admin/videos/[id]/route.ts`

**Request body:**
```
  title
  recordingFile
  introTitle
  introSec
  videoSec
  endSec
  titleCardDurationSec
  captionDurationSec
  endTagline
  endCta
  steps
  isActive
  phoneWidth
  phoneHeight
```

**Status codes:** 200, 401, 404

---

### `GET` `/api/admin/videos/:id/props` `PUBLIC`

Returns the Remotion-compatible props JSON for a video config. Used by the render script to pass --props to Remotion CLI. No auth required — only called from local CLI during rendering.

**File:** `app/api/admin/videos/[id]/props/route.ts`

**Status codes:** 200, 404

---

### `POST` `/api/admin/videos/:id/render` `ADMIN`

POST /api/admin/videos/[id]/render?action=render|preview Streams Remotion CLI output as newline-delimited JSON. Each line: { "type": "stdout"|"stderr"|"status"|"done"|"error", "text": "..." } Only wor

**File:** `app/api/admin/videos/[id]/render/route.ts`

**Status codes:** 200, 400, 401, 403, 404, 500, 501

---

## Bookings

### `POST` `/api/bookings/:postId/accept` `AUTH`

**File:** `app/api/bookings/[postId]/accept/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 403, 404, 409, 500

---

### `POST` `/api/bookings/:postId/decline` `AUTH`

**File:** `app/api/bookings/[postId]/decline/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404

---

### `GET` `POST` `/api/bookings/:postId/select` `AUTH`

POST — Rider selects a driver from interested drivers. Creates the ride record and notifies all parties.

**File:** `app/api/bookings/[postId]/select/route.ts`

**Request body:**
```
  driverUserId
```

**Status codes:** 200, 400, 401, 404, 409, 500

---

## Chat

### `POST` `/api/chat/booking` `AUTH`

POST /api/chat/booking GPT-powered conversational booking for HMU link visitors. Uses function calling to extract booking details, check availability, etc.

**File:** `app/api/chat/booking/route.ts`

**Request body:**
```
  messages
  driverHandle
  extractedSoFar
  currentStep
```

**Status codes:** 200, 400, 403, 404, 429, 500, 502

---

### `POST` `/api/chat/support` `AUTH`

**File:** `app/api/chat/support/route.ts`

**Request body:**
```
  messages
  conversationId
```

**Status codes:** 200, 400, 401, 404, 500, 502

---

## Data Room

### `POST` `/api/data-room/consent` `PUBLIC`

**File:** `app/api/data-room/consent/route.ts`

**Status codes:** 200, 400, 401, 429, 500

---

### `GET` `/api/data-room/documents` `PUBLIC`

**File:** `app/api/data-room/documents/route.ts`

**Status codes:** 200, 401, 500

---

### `GET` `/api/data-room/documents/:id/download` `PUBLIC`

**File:** `app/api/data-room/documents/[id]/download/route.ts`

**Status codes:** 200, 401, 404, 500

---

### `POST` `/api/data-room/verify` `PUBLIC`

**File:** `app/api/data-room/verify/route.ts`

**Status codes:** 200, 400, 401, 429

---

## Driver

### `GET` `/api/driver/:handle` `AUTH`

**File:** `app/api/driver/[handle]/route.ts`

**Request body:**
```
  completed: number
  cancelled: number
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `/api/driver/analytics` `AUTH`

**File:** `app/api/driver/analytics/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `/api/driver/balance` `AUTH`

**File:** `app/api/driver/balance/route.ts`

**Request body:**
```
  stripe_account_id: string | null
  stripe_instant_eligible: boolean
  tier: string
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `POST` `/api/driver/cash-packs` `AUTH`

GET — get driver's cash ride balance

**File:** `app/api/driver/cash-packs/route.ts`

**Request body:**
```
  pack
  paymentMethodId
```

**Status codes:** 200, 400, 401, 402, 404, 500

---

### `POST` `/api/driver/cashout` `AUTH`

**File:** `app/api/driver/cashout/route.ts`

**Request body:**
```
  method
  amount
```

**Status codes:** 200, 400, 401, 404, 500

---

### `GET` `/api/driver/dashboard` `AUTH`

GET /api/driver/dashboard?view=today|week Returns bookings with full ride + rider details for the driver dashboard.

**File:** `app/api/driver/dashboard/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `/api/driver/earnings` `AUTH`

**File:** `app/api/driver/earnings/route.ts`

**Request body:**
```
  id: string
  tier: string
```

**Status codes:** 200, 401, 404

---

### `GET` `/api/driver/earnings-audit` `AUTH`

GET — Returns a full earnings audit for the driver. Formula: Launch Offer earnings_used = Cash gross + Digital gross (during offer period) Cash collected = SUM(final_agreed_price + add_on_total) for c

**File:** `app/api/driver/earnings-audit/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `/api/driver/enrollment` `AUTH`

**File:** `app/api/driver/enrollment/route.ts`

**Response fields:** `enrolled`

**Status codes:** 200, 401, 404, 500

---

### `POST` `/api/driver/onboarding/start` `AUTH`

**File:** `app/api/driver/onboarding/start/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `POST` `/api/driver/payment-setup` `AUTH`

POST — Create a SetupIntent for saving a driver's payment method (for HMU First subscription and Cash Pack purchases — NOT for ride payouts)

**File:** `app/api/driver/payment-setup/route.ts`

**Request body:**
```
  user_id: string
  stripe_customer_id: string | null
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `/api/driver/payout-setup` `AUTH`

**File:** `app/api/driver/payout-setup/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404

---

### `GET` `/api/driver/payout-setup/bank` `AUTH`

**File:** `app/api/driver/payout-setup/bank/route.ts`

**Status codes:** 200, 401

---

### `POST` `/api/driver/payout-setup/session` `AUTH`

**File:** `app/api/driver/payout-setup/session/route.ts`

**Request body:**
```
  user_id: string
  stripe_account_id: string | null
  first_name: string
  last_name: string
  email: string
```

**Status codes:** 200, 401, 404, 500

---

### `POST` `/api/driver/payout-setup/update` `AUTH`

**File:** `app/api/driver/payout-setup/update/route.ts`

**Status codes:** 200, 400, 401, 500

---

### `GET` `POST` `DELETE` `/api/driver/posts` `AUTH`

GET — list driver's active availability posts

**File:** `app/api/driver/posts/route.ts`

**Request body:**
```
  message
  price
```

**Status codes:** 200, 201, 400, 401, 404, 500

---

### `GET` `POST` `PATCH` `/api/driver/schedule` `AUTH`

GET — Fetch driver's weekly schedule + bookings for a date range. Query: ?weekOf=2026-03-30 (defaults to current week)

**File:** `app/api/driver/schedule/route.ts`

**Request body:**
```
  days
```

**Status codes:** 200, 400, 401, 404, 409, 500

---

### `GET` `POST` `PATCH` `DELETE` `/api/driver/service-menu` `AUTH`

GET — Returns driver's menu + platform catalog

**File:** `app/api/driver/service-menu/route.ts`

**Request body:**
```
  menu_item_id
  ...updates
```

**Status codes:** 200, 201, 400, 401, 403, 404, 500

---

### `GET` `POST` `/api/driver/upgrade` `AUTH`

POST — create Checkout session for HMU First subscription

**File:** `app/api/driver/upgrade/route.ts`

**Request body:**
```
  user_id: string
  tier: string
  stripe_account_id: string | null
```

**Status codes:** 200, 400, 401, 404, 500

---

### `POST` `/api/driver/upgrade-inline` `AUTH`

POST — Create a SetupIntent for collecting payment method inline. After the frontend confirms the SetupIntent, it calls GET /api/driver/upgrade which creates the actual subscription with the saved pay

**File:** `app/api/driver/upgrade-inline/route.ts`

**Request body:**
```
  user_id: string
  tier: string
```

**Status codes:** 200, 400, 401, 404, 500

---

## Drivers (Public)

### `GET` `/api/drivers/:handle` `PUBLIC`

**File:** `app/api/drivers/[handle]/route.ts`

**Status codes:** 200, 404

---

### `POST` `DELETE` `/api/drivers/:handle/book` `AUTH`

DELETE — rider cancels their active booking request

**File:** `app/api/drivers/[handle]/book/route.ts`

**Request body:**
```
  price
  timeWindow
  is_cash
```

**Status codes:** 200, 201, 400, 401, 403, 404, 409, 429

---

### `GET` `/api/drivers/:handle/eligibility` `AUTH`

**File:** `app/api/drivers/[handle]/eligibility/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404

---

### `GET` `POST` `PATCH` `/api/drivers/availability` `AUTH`

GET driver availability/schedule

**File:** `app/api/drivers/availability/route.ts`

**Request body:**
```
  schedule
  areas
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `PATCH` `/api/drivers/booking-settings` `AUTH`

**File:** `app/api/drivers/booking-settings/route.ts`

**Request body:**
```
  profile_type: string
```

**Status codes:** 200, 400, 401, 403

---

### `GET` `/api/drivers/check-handle` `PUBLIC`

**File:** `app/api/drivers/check-handle/route.ts`

**Response fields:** `available`

**Status codes:** 200

---

### `POST` `/api/drivers/location` `PUBLIC`

**File:** `app/api/drivers/location/route.ts`

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `GET` `/api/drivers/requests` `AUTH`

**File:** `app/api/drivers/requests/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404

---

## Feed

### `GET` `/api/feed/riders` `AUTH`

**File:** `app/api/feed/riders/route.ts`

**Status codes:** 200, 400, 401, 403, 500

---

## Other

### `POST` `/api/leads` `PUBLIC`

**File:** `app/api/leads/route.ts`

**Status codes:** 200, 201, 400, 500

---

### `GET` `/api/meta-verify` `PUBLIC`

**File:** `app/api/meta-verify/route.ts`

**Status codes:** 200

---

### `GET` `/api/pitch-videos` `PUBLIC`

Public — returns map of chapterId → video URL for the pitch page

**File:** `app/api/pitch-videos/route.ts`

**Request body:**
```
  list: (opts: { prefix: string
```

**Status codes:** 200

---

### `GET` `POST` `PATCH` `/api/support/tickets` `ADMIN`

POST — rider/driver submits a support ticket

**File:** `app/api/support/tickets/route.ts`

**Request body:**
```
  rideId
  category
  message
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

## Payments

### `GET` `POST` `/api/payments/methods` `AUTH`

GET — list saved payment methods

**File:** `app/api/payments/methods/route.ts`

**Request body:**
```
  id: string
  stripe_customer_id: string | null
```

**Status codes:** 200, 400, 401, 404

---

### `POST` `/api/payments/setup-intent-complete` `AUTH`

**File:** `app/api/payments/setup-intent-complete/route.ts`

**Request body:**
```
  paymentMethodId
```

**Status codes:** 200, 400, 401, 404

---

## Rider

### `GET` `/api/rider/:handle` `AUTH`

**File:** `app/api/rider/[handle]/route.ts`

**Status codes:** 200, 401, 404, 500

---

### `GET` `POST` `DELETE` `/api/rider/draft-booking` `AUTH`

POST — Save a draft booking inquiry (chat data) server-side. Called after rider signs up so booking data survives device/browser changes.

**File:** `app/api/rider/draft-booking/route.ts`

**Request body:**
```
  driverHandle
  bookingData
```

**Status codes:** 200, 400, 401, 404

---

### `GET` `/api/rider/payment-methods` `AUTH`

**File:** `app/api/rider/payment-methods/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404, 500

---

### `POST` `/api/rider/payment-methods/checkout` `AUTH`

**File:** `app/api/rider/payment-methods/checkout/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404, 500

---

### `POST` `/api/rider/payment-methods/save` `AUTH`

**File:** `app/api/rider/payment-methods/save/route.ts`

**Request body:**
```
  paymentMethodId
```

**Status codes:** 200, 400, 401, 404

---

### `POST` `/api/rider/payment-methods/setup-intent` `AUTH`

**File:** `app/api/rider/payment-methods/setup-intent/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404

---

### `GET` `POST` `DELETE` `/api/rider/posts` `AUTH`

GET — list rider's active posts

**File:** `app/api/rider/posts/route.ts`

**Request body:**
```
  message
  price
  is_cash
```

**Status codes:** 200, 201, 400, 401, 404, 409, 500

---

## Rides

### `GET` `/api/rides/:id` `PUBLIC`

**File:** `app/api/rides/[id]/route.ts`

**Status codes:** 200, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/accept` `PUBLIC`

**File:** `app/api/rides/[id]/accept/route.ts`

**Status codes:** 200, 400, 401, 403, 404, 409, 500

---

### `GET` `POST` `PATCH` `/api/rides/:id/add-ons` `AUTH`

GET — list add-ons for a ride

**File:** `app/api/rides/[id]/add-ons/route.ts`

**Request body:**
```
  menu_item_id
  quantity
```

**Status codes:** 200, 201, 400, 401, 403, 404, 500

---

### `POST` `PATCH` `/api/rides/:id/add-stop` `AUTH`

POST — Rider requests a new stop during an active ride. PATCH — Driver accepts or declines the stop request.

**File:** `app/api/rides/[id]/add-stop/route.ts`

**Request body:**
```
  address
  latitude
  longitude
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/cancel` `AUTH`

**File:** `app/api/rides/[id]/cancel/route.ts`

**Request body:**
```
  reason
```

**Status codes:** 200, 400, 401, 404, 500

---

### `GET` `POST` `/api/rides/:id/comment` `PUBLIC`

Get all comments for a ride (conversation history)

**File:** `app/api/rides/[id]/comment/route.ts`

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/complete` `PUBLIC`

**File:** `app/api/rides/[id]/complete/route.ts`

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/confirm-start` `AUTH`

Rider confirms they're in the car → capture payment → ride active. Called after driver taps "Start Ride" and ride is in "confirming" status. Also handles auto-confirm (2 min timeout triggers this from

**File:** `app/api/rides/[id]/confirm-start/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/coo` `AUTH`

**File:** `app/api/rides/[id]/coo/route.ts`

**Request body:**
```
  lat
  lng
  locationText
  validatedPickup
  validatedDropoff
  validatedStops
```

**Status codes:** 200, 400, 401, 402, 403, 404, 500

---

### `POST` `/api/rides/:id/end` `AUTH`

**File:** `app/api/rides/[id]/end/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/eta-nudge` `AUTH`

Rider-triggered SMS nudge to driver when ETA goes stale (90s no location update). Sends one SMS per ride status phase. Prevents spam via DB flag.

**File:** `app/api/rides/[id]/eta-nudge/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 403, 404, 500

---

### `POST` `PATCH` `/api/rides/:id/extend-wait` `AUTH`

POST — Rider requests more wait time PATCH — Driver approves or denies the extension

**File:** `app/api/rides/[id]/extend-wait/route.ts`

**Request body:**
```
  approve
  extraMinutes
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/here` `AUTH`

**File:** `app/api/rides/[id]/here/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/location` `AUTH`

**File:** `app/api/rides/[id]/location/route.ts`

**Request body:**
```
  lat
  lng
```

**Status codes:** 200, 400, 401, 404, 500

---

### `GET` `/api/rides/:id/menu` `AUTH`

**File:** `app/api/rides/[id]/menu/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `GET` `POST` `/api/rides/:id/messages` `AUTH`

**File:** `app/api/rides/[id]/messages/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 201, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/otw` `AUTH`

**File:** `app/api/rides/[id]/otw/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/pulloff` `AUTH`

Driver pulls off / marks rider as no-show. Only available from 'here' or 'confirming' status. chargePercent: 0 (cancel, full refund), 25, or 50 - 25%: driver gets 25%, platform 5%, rider refunded 70% 

**File:** `app/api/rides/[id]/pulloff/route.ts`

**Request body:**
```
  chargePercent
  driverLat
  driverLng
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/rate` `AUTH`

**File:** `app/api/rides/[id]/rate/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/request-location` `AUTH`

Driver requests the rider's live GPS location. Sends an Ably event to the rider. Logged for admin dispute context.

**File:** `app/api/rides/[id]/request-location/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/share-location` `AUTH`

Rider shares their live GPS location in response to a driver request. Updates ride record and publishes to Ably so driver sees the pin.

**File:** `app/api/rides/[id]/share-location/route.ts`

**Request body:**
```
  lat
  lng
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/start` `AUTH`

Driver taps "Start Ride" from HERE status. - Checks proximity (100m) between driver and rider if GPS available - Transitions ride to "confirming" - Sends Ably confirm_start event → rider sees "Confirm

**File:** `app/api/rides/[id]/start/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `/api/rides/:id/stop-reached` `AUTH`

**File:** `app/api/rides/[id]/stop-reached/route.ts`

**Request body:**
```
  stopOrder
  driverLat
  driverLng
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `PATCH` `/api/rides/:id/update-address` `AUTH`

Rider proposes an address update (pickup or dropoff). Only allowed in 'matched' status after COO and before driver goes OTW. Driver must confirm or reject via PATCH.

**File:** `app/api/rides/[id]/update-address/route.ts`

**Request body:**
```
  addressType
  address
  latitude
  longitude
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `POST` `PATCH` `/api/rides/:id/update-price` `AUTH`

Driver proposes a new price after seeing stops/itinerary. Only allowed in 'matched' status (before OTW). Rider must accept or decline via Ably.

**File:** `app/api/rides/[id]/update-price/route.ts`

**Request body:**
```
  newPrice
  reason
```

**Status codes:** 200, 400, 401, 403, 404, 500

---

### `GET` `/api/rides/active` `AUTH`

GET — check if user has an active ride

**File:** `app/api/rides/active/route.ts`

**Request body:**
```
  id: string
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `/api/rides/history` `AUTH`

**File:** `app/api/rides/history/route.ts`

**Request body:**
```
  id: string
  profile_type: string
```

**Status codes:** 200, 401, 404, 500

---

### `GET` `/api/rides/nearby-drivers` `PUBLIC`

**File:** `app/api/rides/nearby-drivers/route.ts`

**Status codes:** 200, 400, 401, 500

---

### `POST` `/api/rides/request` `PUBLIC`

**File:** `app/api/rides/request/route.ts`

**Status codes:** 200, 400, 401, 403, 429, 500

---

### `GET` `POST` `PATCH` `DELETE` `/api/rides/schedule` `AUTH`

POST - Create a new scheduled ride

**File:** `app/api/rides/schedule/route.ts`

**Request body:**
```
  pickup_location
  pickup_lat
  pickup_lng
  dropoff_location
  dropoff_lat
  dropoff_lng
  scheduled_time
  estimated_distance
  estimated_duration
  estimated_price
  rider_notes
  preferred_driver_id
```

**Status codes:** 200, 201, 400, 401, 403, 404, 500

---

## Search

### `POST` `/api/search/track` `AUTH`

**File:** `app/api/search/track/route.ts`

**Request body:**
```
  event
  query
  resultCount
  topResult
  noResults
  selectedLabel
  selectedHref
  selectedBreadcrumb
```

**Response fields:** `ok`

**Status codes:** 200

---

## Upload

### `POST` `/api/upload/video` `AUTH`

**File:** `app/api/upload/video/route.ts`

**Request body:**
```
  put: (key: string, value: ArrayBuffer, options?: Record<string, unknown>) => Promise<unknown>
```

**Status codes:** 200, 400, 401, 500

---

## Users

### `GET` `POST` `/api/users/activity` `PUBLIC`

Get user engagement metrics for personalization

**File:** `app/api/users/activity/route.ts`

**Status codes:** 200, 400, 401, 500

---

### `POST` `/api/users/auth/remove-password` `AUTH`

**File:** `app/api/users/auth/remove-password/route.ts`

**Status codes:** 200, 400, 401, 500

---

### `GET` `/api/users/me` `AUTH`

**File:** `app/api/users/me/route.ts`

**Request body:**
```
  id: string
  profile_type: string
  account_status: string
  driver_handle: string | null
```

**Status codes:** 200, 401, 404

---

### `GET` `POST` `/api/users/onboarding` `AUTH`

GET endpoint to check onboarding status

**File:** `app/api/users/onboarding/route.ts`

**Request body:**
```
  profile_type
  last_name
  display_name
  phone
  gender
  pronouns
  lgbtq_friendly
  video_url
  thumbnail_url
  require_lgbtq_friendly
  min_driver_rating
  require_verification
  avoid_disputes
  price_range
  stripe_customer_id
  pricing
  schedule
  vehicle_info
  license_plate
  plate_state
  ad_photo_url
  stripe_connect_id
  require_og_status
  min_rider_chill_score
  avoid_riders_with_disputes
```

**Status codes:** 200, 201, 400, 401, 500

---

### `GET` `/api/users/pending-actions` `AUTH`

**File:** `app/api/users/pending-actions/route.ts`

**Response fields:** `actions`

**Status codes:** 200

---

### `GET` `/api/users/personalization` `PUBLIC`

**File:** `app/api/users/personalization/route.ts`

**Status codes:** 200, 401, 500

---

### `GET` `PATCH` `/api/users/profile` `AUTH`

GET user profile(s)

**File:** `app/api/users/profile/route.ts`

**Request body:**
```
  profile_type
  ...updates
```

**Status codes:** 200, 400, 401, 404, 500

---

## Webhooks

### `POST` `/api/webhooks/clerk` `AUTH`

**File:** `app/api/webhooks/clerk/route.ts`

**Request body:**
```
  user_id: string
```

**Status codes:** 200, 201, 400, 500

---

### `POST` `/api/webhooks/stripe` `PUBLIC`

**File:** `app/api/webhooks/stripe/route.ts`

**Status codes:** 200, 400, 500

---

### `GET` `POST` `/api/webhooks/voipms` `PUBLIC`

**File:** `app/api/webhooks/voipms/route.ts`

**Response fields:** `status`, `reason`

**Status codes:** 200

---
