# HMU ATL — Technical Reference

> Auto-generated on 2026-04-13
> Re-run: `npx tsx scripts/generate-api-docs.ts && npx tsx scripts/combine-docs.ts`

This document is the single source of truth for all API endpoints and database schema.
It is auto-generated from the codebase and live Neon database — do not edit manually.

---

## Table of Contents

1. [API Reference](#hmu-atl--api-reference)
2. [Database Schema — Tables & Columns](#neon-database-schema--all-tables--columns)
3. [Database Schema — Constraints & Foreign Keys](#database-constraints)

---
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


---

# Neon Database Schema — All Tables & Columns

**Tables: 53** | **Total columns: 673**

---

### admin_audit_log

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| admin_id | uuid | YES |  |
| action | text | NO |  |
| target_type | text | YES |  |
| target_id | text | YES |  |
| details | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |

### admin_notification_config

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| notification_type | text | NO |  |
| enabled | boolean | YES | true |
| admin_phone | text | YES |  |
| excluded_user_ids | ARRAY | YES | '{}'::text[] |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| signup_after | date | YES |  |
| exclude_before | date | YES |  |

### admin_sms_sent

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| admin_id | uuid | YES |  |
| recipient_id | uuid | YES |  |
| recipient_phone | text | NO |  |
| message | text | NO |  |
| twilio_sid | text | YES |  |
| status | text | YES |  |
| sent_at | timestamp with time zone | YES | now() |

### blocked_users

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| blocker_id | uuid | NO |  |
| blocked_id | uuid | NO |  |
| reason | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

### comments

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| author_id | uuid | NO |  |
| subject_id | uuid | NO |  |
| content | text | NO |  |
| sentiment_score | numeric(3,2) | YES |  |
| is_visible | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### content_prompts

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| created_at | timestamp with time zone | YES | now() |
| created_by | text | NO |  |
| type | text | NO |  |
| inputs | jsonb | NO |  |
| gemini_prompt | text | YES |  |
| timing_sheet | text | YES |  |
| hook_text | text | YES |  |
| trend_context | text | YES |  |
| status | text | YES | 'draft'::text |
| platform | ARRAY | YES |  |
| posted_at | timestamp with time zone | YES |  |
| notes | text | YES |  |

### daily_earnings

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| earnings_date | date | NO |  |
| week_start_date | date | NO |  |
| gross_earnings | numeric(10,2) | YES | 0 |
| platform_fee_paid | numeric(10,2) | YES | 0 |
| weekly_platform_fee_paid | numeric(10,2) | YES | 0 |
| rides_completed | integer | YES | 0 |
| daily_cap_hit | boolean | YES | false |
| weekly_cap_hit | boolean | YES | false |
| updated_at | timestamp with time zone | YES | now() |

### data_room_access_logs

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| consent_id | uuid | YES |  |
| document_id | uuid | YES |  |
| action | text | NO |  |
| ip_address | text | YES |  |
| accessed_at | timestamp with time zone | YES | now() |

### data_room_consents

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| full_name | text | NO |  |
| email | text | NO |  |
| phone | text | YES |  |
| company | text | YES |  |
| title | text | YES |  |
| ip_address | text | YES |  |
| user_agent | text | YES |  |
| consented_at | timestamp with time zone | YES | now() |
| access_code_used | text | NO |  |
| nda_version | text | NO | '1.0'::text |
| revoked_at | timestamp with time zone | YES |  |

### data_room_documents

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO |  |
| description | text | YES |  |
| category | text | NO |  |
| file_key | text | NO |  |
| file_name | text | NO |  |
| file_type | text | NO |  |
| file_size_bytes | bigint | NO |  |
| version | integer | NO | 1 |
| is_active | boolean | YES | true |
| uploaded_by | text | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### disputes

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| filed_by | uuid | NO |  |
| reason | text | NO |  |
| status | character varying(20) | YES | 'open'::character varying |
| ably_history_url | text | YES |  |
| resolved_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |

### draft_bookings

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| rider_id | uuid | NO |  |
| driver_handle | text | NO |  |
| booking_data | jsonb | NO |  |
| expires_at | timestamp with time zone | NO | (now() + '48:00:00'::interval) |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### driver_bookings

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| rider_id | uuid | YES |  |
| ride_id | uuid | YES |  |
| booking_type | text | NO |  |
| start_at | timestamp with time zone | NO |  |
| end_at | timestamp with time zone | NO |  |
| timezone | text | YES | 'America/New_York'::text |
| recurring_group_id | uuid | YES |  |
| status | text | YES | 'confirmed'::text |
| title | text | YES |  |
| notes | text | YES |  |
| market_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| details | jsonb | YES | '{}'::jsonb |

### driver_enrollment_offers

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO |  |
| free_rides | integer | NO |  |
| free_earnings_cap | numeric(10,2) | NO |  |
| free_days | integer | NO |  |
| headline | text | NO |  |
| fine_print | text | NO |  |
| is_active | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

### driver_offer_enrollments

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| offer_id | uuid | YES |  |
| free_rides | integer | NO |  |
| free_earnings_cap | numeric(10,2) | NO |  |
| free_days | integer | NO |  |
| enrolled_at | timestamp with time zone | YES | now() |
| rides_used | integer | YES | 0 |
| earnings_used | numeric(10,2) | YES | 0 |
| total_waived_fees | numeric(10,2) | YES | 0 |
| status | text | YES | 'active'::text |
| exhausted_at | timestamp with time zone | YES |  |
| exhausted_reason | text | YES |  |

### driver_profiles

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| areas | jsonb | NO |  |
| pricing | jsonb | NO |  |
| schedule | jsonb | NO |  |
| vehicle_info | jsonb | NO |  |
| stripe_account_id | character varying(255) | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| handle | text | YES |  |
| accept_direct_bookings | boolean | NO | true |
| min_rider_chill_score | numeric(5,2) | NO | 0 |
| require_og_status | boolean | NO | false |
| first_name | text | YES |  |
| last_name | text | YES |  |
| display_name | text | YES |  |
| lgbtq_friendly | boolean | YES | false |
| video_url | text | YES |  |
| thumbnail_url | text | YES |  |
| phone | text | YES |  |
| email | text | YES |  |
| stripe_onboarding_complete | boolean | YES | false |
| stripe_external_account_last4 | text | YES |  |
| stripe_external_account_type | text | YES |  |
| stripe_external_account_bank | text | YES |  |
| stripe_instant_eligible | boolean | YES | false |
| payout_method | text | YES |  |
| payout_setup_complete | boolean | YES | false |
| stripe_subscription_id | text | YES |  |
| subscription_status | text | YES | 'free'::text |
| min_ride_price | numeric(10,2) | YES | 10.00 |
| show_video_on_link | boolean | YES | true |
| profile_visible | boolean | YES | true |
| enforce_minimum | boolean | YES | true |
| fwu | boolean | YES | false |
| stripe_customer_id | text | YES |  |
| accepts_cash | boolean | YES | false |
| cash_only | boolean | YES | false |
| cash_rides_remaining | integer | YES | 3 |
| cash_rides_reset_at | timestamp with time zone | YES | now() |
| cash_pack_balance | integer | YES | 0 |
| wait_minutes | integer | YES | 10 |
| advance_notice_hours | integer | YES | 0 |
| vibe_video_url | text | YES |  |
| allow_in_route_stops | boolean | YES | true |

### driver_schedules

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| day_of_week | integer | NO |  |
| start_time | time without time zone | NO |  |
| end_time | time without time zone | NO |  |
| is_active | boolean | YES | true |
| timezone | text | YES | 'America/New_York'::text |
| market_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### driver_service_areas

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_profile_id | uuid | NO |  |
| area_name | character varying(100) | NO |  |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### driver_service_menu

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| item_id | text | YES |  |
| custom_name | text | YES |  |
| custom_icon | text | YES |  |
| price | numeric(10,2) | NO |  |
| pricing_type | text | NO |  |
| unit_label | text | YES |  |
| is_active | boolean | YES | true |
| sort_order | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |

### hmu_posts

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| post_type | character varying(20) | NO |  |
| areas | ARRAY | NO |  |
| price | numeric(10,2) | NO |  |
| time_window | jsonb | NO |  |
| status | character varying(20) | YES | 'active'::character varying |
| expires_at | timestamp with time zone | NO |  |
| created_at | timestamp with time zone | YES | now() |
| target_driver_id | uuid | YES |  |
| booking_expires_at | timestamp with time zone | YES |  |
| is_cash | boolean | YES | false |
| market_id | uuid | YES |  |

### hold_policy

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| tier | text | NO |  |
| hold_mode | text | YES | 'full'::text |
| hold_percent | numeric(5,4) | YES | NULL::numeric |
| hold_fixed | numeric(10,2) | YES | NULL::numeric |
| hold_minimum | numeric(10,2) | YES | 5.00 |
| cancel_before_otw_refund_pct | numeric(5,4) | YES | 1.0000 |
| cancel_after_otw_driver_pct | numeric(5,4) | YES | 1.0000 |
| cancel_after_otw_platform_pct | numeric(5,4) | YES | 0.0000 |
| no_show_platform_tiers | jsonb | YES | '[]'::jsonb |
| effective_from | date | NO | CURRENT_DATE |
| effective_to | date | YES |  |
| change_reason | text | YES |  |
| changed_by | uuid | YES |  |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### leads

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| email | text | YES |  |
| phone | text | YES |  |
| lead_type | text | NO |  |
| source | text | NO | 'landing_page'::text |
| utm_source | text | YES |  |
| utm_medium | text | YES |  |
| utm_campaign | text | YES |  |
| converted | boolean | YES | false |
| converted_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |

### market_areas

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| market_id | uuid | YES |  |
| name | text | NO |  |
| slug | text | NO |  |
| center_lat | numeric(10,8) | YES |  |
| center_lng | numeric(11,8) | YES |  |
| radius_miles | numeric(5,1) | YES | 5 |
| sort_order | integer | YES | 0 |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### markets

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| slug | text | NO |  |
| name | text | NO |  |
| subdomain | text | NO |  |
| state | text | YES |  |
| timezone | text | YES | 'America/New_York'::text |
| center_lat | numeric(10,8) | YES |  |
| center_lng | numeric(11,8) | YES |  |
| radius_miles | integer | YES | 50 |
| status | text | YES | 'setup'::text |
| launch_date | timestamp with time zone | YES |  |
| min_drivers_to_launch | integer | YES | 10 |
| fee_config | jsonb | YES | '{}'::jsonb |
| launch_offer_config | jsonb | YES | '{}'::jsonb |
| sms_did | text | YES |  |
| sms_area_code | text | YES |  |
| branding | jsonb | YES | '{}'::jsonb |
| areas_bbox | text | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### notifications

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| type | character varying(50) | NO |  |
| payload | jsonb | YES |  |
| sent_at | timestamp with time zone | YES | now() |
| read_at | timestamp with time zone | YES |  |

### payouts

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| driver_id | uuid | NO |  |
| amount | numeric(10,2) | NO |  |
| fee | numeric(10,2) | NO |  |
| timing_tier | character varying(20) | NO |  |
| stripe_transfer_id | character varying(255) | YES |  |
| created_at | timestamp with time zone | YES | now() |
| processed_at | timestamp with time zone | YES |  |

### platform_config

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| config_key | text | NO |  |
| config_value | jsonb | NO | '{}'::jsonb |
| updated_by | text | YES |  |
| updated_at | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |

### price_negotiations

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | YES |  |
| proposed_by | uuid | YES |  |
| proposed_price | numeric(10,2) | NO |  |
| status | text | YES | 'pending'::text |
| expires_at | timestamp with time zone | YES | (now() + '00:10:00'::interval) |
| created_at | timestamp with time zone | YES | now() |

### pricing_config

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| tier | text | NO |  |
| fee_rate | numeric(5,4) | NO |  |
| daily_cap | numeric(10,2) | NO |  |
| weekly_cap | numeric(10,2) | NO |  |
| progressive_thresholds | jsonb | YES |  |
| peak_multiplier | numeric(4,2) | YES | 1.00 |
| peak_label | text | YES |  |
| effective_from | date | NO | CURRENT_DATE |
| effective_to | date | YES |  |
| change_reason | text | YES |  |
| changed_by | uuid | YES |  |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

### rate_limit_counters

| Column | Type | Nullable | Default |
|---|---|---|---|
| key | text | NO |  |
| count | integer | NO | 0 |
| window_start | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

### ratings

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| rater_id | uuid | NO |  |
| rated_id | uuid | NO |  |
| rating_type | character varying(20) | NO |  |
| created_at | timestamp with time zone | YES | now() |

### ride_add_ons

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | YES |  |
| menu_item_id | uuid | YES |  |
| name | text | NO |  |
| unit_price | numeric(10,2) | NO |  |
| quantity | integer | YES | 1 |
| subtotal | numeric(10,2) | NO |  |
| added_by | text | YES | 'rider'::text |
| status | text | YES | 'pre_selected'::text |
| rider_adjusted_amount | numeric(10,2) | YES |  |
| dispute_reason | text | YES |  |
| final_amount | numeric(10,2) | YES |  |
| added_at | timestamp with time zone | YES | now() |
| confirmed_at | timestamp with time zone | YES |  |

### ride_comments

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| user_id | uuid | NO |  |
| message | text | NO |  |
| comment_type | character varying(50) | YES | 'general'::character varying |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### ride_interests

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| post_id | uuid | YES |  |
| driver_id | uuid | YES |  |
| status | text | YES | 'interested'::text |
| price_offered | numeric(10,2) | YES |  |
| message | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

### ride_locations

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| lat | numeric(10,8) | NO |  |
| lng | numeric(11,8) | NO |  |
| recorded_at | timestamp with time zone | YES | now() |
| user_id | uuid | YES |  |

### ride_messages

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | NO |  |
| sender_id | uuid | NO |  |
| content | text | NO |  |
| created_at | timestamp with time zone | YES | now() |
| message_type | text | YES | 'chat'::text |
| quick_key | text | YES |  |
| sms_sent | boolean | YES | false |

### rider_payment_methods

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| rider_id | uuid | YES |  |
| stripe_payment_method_id | text | NO |  |
| type | text | NO |  |
| brand | text | YES |  |
| last4 | text | NO |  |
| exp_month | integer | YES |  |
| exp_year | integer | YES |  |
| is_default | boolean | YES | false |
| apple_pay | boolean | YES | false |
| google_pay | boolean | YES | false |
| cash_app_pay | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

### rider_profiles

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| price_range | jsonb | YES |  |
| driver_preference | character varying(20) | YES |  |
| stripe_customer_id | character varying(255) | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| first_name | text | YES |  |
| last_name | text | YES |  |
| lgbtq_friendly | boolean | YES | false |
| video_url | text | YES |  |
| thumbnail_url | text | YES |  |
| safety_preferences | jsonb | YES | '{}'::jsonb |
| display_name | text | YES |  |
| handle | text | YES |  |
| avatar_url | text | YES |  |
| vibe_video_url | text | YES |  |
| phone | text | YES |  |

### rides

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | NO |  |
| rider_id | uuid | NO |  |
| status | character varying(20) | YES | 'matched'::character varying |
| pickup | jsonb | YES |  |
| dropoff | jsonb | YES |  |
| stops | jsonb | YES |  |
| amount | numeric(10,2) | NO |  |
| payment_intent_id | character varying(255) | YES |  |
| application_fee | numeric(10,2) | YES |  |
| driver_confirmed_end | boolean | YES | false |
| dispute_window_expires_at | timestamp with time zone | YES |  |
| started_at | timestamp with time zone | YES |  |
| ended_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| price_mode | text | YES | 'proposed'::text |
| proposed_price | numeric(10,2) | YES |  |
| auto_calculated_price | numeric(10,2) | YES |  |
| final_agreed_price | numeric(10,2) | YES |  |
| price_accepted_at | timestamp with time zone | YES |  |
| payment_authorized | boolean | YES | false |
| payment_authorized_at | timestamp with time zone | YES |  |
| payment_captured | boolean | YES | false |
| payment_captured_at | timestamp with time zone | YES |  |
| platform_fee_amount | numeric(10,2) | YES |  |
| driver_payout_amount | numeric(10,2) | YES |  |
| stripe_fee_amount | numeric(10,2) | YES |  |
| funds_held | boolean | YES | false |
| hmu_post_id | uuid | YES |  |
| otw_at | timestamp with time zone | YES |  |
| here_at | timestamp with time zone | YES |  |
| otw_deadline | timestamp with time zone | YES |  |
| agreement_summary | jsonb | YES |  |
| dispute_window_minutes | integer | YES | 15 |
| rider_rating | text | YES |  |
| driver_rating | text | YES |  |
| rider_auto_rated | boolean | YES | false |
| coo_at | timestamp with time zone | YES |  |
| rider_lat | numeric(10,8) | YES |  |
| rider_lng | numeric(11,8) | YES |  |
| rider_location_text | text | YES |  |
| completed_at | timestamp with time zone | YES |  |
| is_cash | boolean | YES | false |
| wait_minutes | integer | YES | 10 |
| rider_start_lat | numeric(10,8) | YES |  |
| rider_start_lng | numeric(11,8) | YES |  |
| driver_start_lat | numeric(10,8) | YES |  |
| driver_start_lng | numeric(11,8) | YES |  |
| driver_end_lat | numeric(10,8) | YES |  |
| driver_end_lng | numeric(11,8) | YES |  |
| rider_end_lat | numeric(10,8) | YES |  |
| rider_end_lng | numeric(11,8) | YES |  |
| rider_confirmed_start | boolean | YES | false |
| pulloff_amount | numeric(10,2) | YES |  |
| pulloff_at | timestamp with time zone | YES |  |
| pulloff_driver_lat | numeric(10,8) | YES |  |
| pulloff_driver_lng | numeric(11,8) | YES |  |
| pulloff_rider_lat | numeric(10,8) | YES |  |
| pulloff_rider_lng | numeric(11,8) | YES |  |
| waived_fee_amount | numeric(10,2) | YES | 0 |
| add_on_reserve | numeric(10,2) | YES | 0 |
| add_on_total | numeric(10,2) | YES | 0 |
| confirm_deadline | timestamp with time zone | YES |  |
| proximity_check_m | numeric(10,2) | YES |  |
| no_show_percent | integer | YES |  |
| no_show_base_charge | numeric(10,2) | YES |  |
| no_show_addon_refund | numeric(10,2) | YES |  |
| capture_idempotency_key | text | YES |  |
| auto_confirmed | boolean | YES | false |
| eta_nudge_sent_at | timestamp with time zone | YES |  |
| driver_here_lat | numeric(10,8) | YES |  |
| driver_here_lng | numeric(11,8) | YES |  |
| here_proximity_ft | integer | YES |  |
| here_verified | boolean | YES |  |
| end_proximity_ft | integer | YES |  |
| end_verified | boolean | YES |  |
| total_distance_miles | numeric(8,2) | YES |  |
| total_duration_minutes | integer | YES |  |
| rate_per_mile | numeric(8,2) | YES |  |
| rate_per_minute | numeric(8,2) | YES |  |
| pickup_address | text | YES |  |
| pickup_lat | numeric(10,8) | YES |  |
| pickup_lng | numeric(11,8) | YES |  |
| dropoff_address | text | YES |  |
| dropoff_lat | numeric(10,8) | YES |  |
| dropoff_lng | numeric(11,8) | YES |  |
| proposed_price_reason | text | YES |  |
| early_end_reason | text | YES |  |
| early_end_notes | text | YES |  |
| market_id | uuid | YES |  |
| proposed_address_update | jsonb | YES |  |
| ref_code | text | YES |  |
| visible_deposit | numeric(10,2) | YES | NULL::numeric |
| hold_policy_id | uuid | YES |  |

### schedule_events

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| driver_id | uuid | YES |  |
| rider_id | uuid | YES |  |
| event_type | text | NO |  |
| details | jsonb | YES | '{}'::jsonb |
| market_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |

### search_events

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| event | text | NO |  |
| query | text | YES |  |
| result_count | integer | YES |  |
| top_result | text | YES |  |
| no_results | boolean | YES | false |
| selected_label | text | YES |  |
| selected_href | text | YES |  |
| selected_breadcrumb | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

### service_menu_items

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | text | NO |  |
| name | text | NO |  |
| default_price | numeric(10,2) | NO |  |
| pricing_type | text | NO |  |
| unit_label | text | YES |  |
| category | text | NO |  |
| icon | text | YES |  |
| sort_order | integer | YES | 0 |
| is_active | boolean | YES | true |

### sms_inbound

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| from_phone | text | NO |  |
| to_did | text | NO |  |
| message | text | NO |  |
| voipms_id | text | YES |  |
| read | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

### sms_log

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| to_phone | text | NO |  |
| from_did | text | NO |  |
| message | text | NO |  |
| status | text | NO | 'pending'::text |
| voipms_status | text | YES |  |
| retry_count | integer | YES | 0 |
| error | text | YES |  |
| ride_id | uuid | YES |  |
| user_id | uuid | YES |  |
| event_type | text | YES |  |
| market | text | YES | 'atl'::text |
| created_at | timestamp with time zone | YES | now() |

### support_conversations

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| user_role | text | NO |  |
| ride_id | uuid | YES |  |
| category | text | YES |  |
| status | text | YES | 'open'::text |
| messages | jsonb | YES | '[]'::jsonb |
| market_id | uuid | YES |  |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

### support_tickets

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| conversation_id | uuid | YES |  |
| category | text | YES |  |
| ride_id | uuid | YES |  |
| subject | text | YES |  |
| details | text | YES |  |
| severity | text | YES | 'medium'::text |
| status | text | YES | 'open'::text |
| admin_id | uuid | YES |  |
| admin_notes | text | YES |  |
| market_id | uuid | YES |  |
| resolved_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | YES | now() |

### suspect_usage_events

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | YES |  |
| event_type | text | NO |  |
| details | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | NO | now() |

### transaction_ledger

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| ride_id | uuid | YES |  |
| user_id | uuid | YES |  |
| user_role | text | YES |  |
| event_type | text | NO |  |
| amount | numeric(10,2) | NO |  |
| direction | text | YES |  |
| description | text | YES |  |
| stripe_reference | text | YES |  |
| created_at | timestamp with time zone | YES | now() |

### user_activity

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| event_name | character varying(100) | NO |  |
| properties | jsonb | YES | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |

### user_preferences

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| user_id | uuid | NO |  |
| favorite_drivers | ARRAY | YES | ARRAY[]::uuid[] |
| saved_routes | jsonb | YES | '[]'::jsonb |
| notification_settings | jsonb | YES | '{"sms": false, "push": true, "email": true}'::jsonb |
| preferred_vehicle_types | ARRAY | YES | ARRAY['sedan'::text] |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| driver_gender_pref | character varying(50) | YES |  |
| rider_gender_pref | character varying(50) | YES |  |
| require_lgbtq_friendly | boolean | YES | false |
| min_driver_rating | numeric(3,2) | YES | 4.0 |
| min_rider_rating | numeric(3,2) | YES | 4.0 |
| require_verification | boolean | YES | false |
| avoid_disputes | boolean | YES | true |
| share_trip_with_emergency_contact | boolean | YES | false |
| emergency_contact_phone | character varying(20) | YES |  |
| emergency_contact_name | character varying(200) | YES |  |
| max_trip_distance_miles | integer | YES |  |
| matching_priority | character varying(50) | YES | 'safety_first'::character varying |

### user_reports

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| reporter_id | uuid | NO |  |
| reported_id | uuid | NO |  |
| ride_id | uuid | YES |  |
| reason | character varying(100) | NO |  |
| details | text | YES |  |
| status | character varying(50) | YES | 'pending'::character varying |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| resolved_at | timestamp with time zone | YES |  |
| resolved_by | uuid | YES |  |

### users

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| clerk_id | character varying(255) | NO |  |
| profile_type | character varying(20) | NO |  |
| account_status | character varying(20) | NO | 'pending_activation'::character varying |
| tier | character varying(20) | YES | 'free'::character varying |
| og_status | boolean | YES | false |
| chill_score | numeric(5,2) | YES | 100 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| last_active | timestamp with time zone | YES | now() |
| gender | character varying(50) | YES |  |
| pronouns | character varying(100) | YES |  |
| lgbtq_friendly | boolean | YES | false |
| is_verified | boolean | YES | false |
| background_check_status | character varying(50) | YES | 'pending'::character varying |
| background_check_date | timestamp with time zone | YES |  |
| completed_rides | integer | YES | 0 |
| is_admin | boolean | YES | false |
| market_id | uuid | YES |  |
| signup_source | text | YES |  |
| referred_by_driver_id | uuid | YES |  |
| referred_via_hmu_post_id | uuid | YES |  |
| admin_last_seen_at | timestamp with time zone | YES |  |
| last_sign_in_at | timestamp with time zone | YES |  |
| first_return_at | timestamp with time zone | YES |  |
| sign_in_count | integer | YES | 0 |
| phone | text | YES |  |

### video_configs

| Column | Type | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| composition_id | text | NO |  |
| title | text | NO |  |
| recording_file | text | NO |  |
| intro_title | text | NO | ''::text |
| intro_sec | numeric(5,1) | YES | 3 |
| video_sec | numeric(6,1) | NO |  |
| end_sec | numeric(5,1) | YES | 5 |
| title_card_duration_sec | numeric(4,1) | YES | 2 |
| caption_duration_sec | numeric(4,1) | YES | 5 |
| end_tagline | text | YES | 'Your city. Your ride. Your rules.'::text |
| end_cta | text | YES | 'HMU ATL'::text |
| steps | jsonb | NO | '[]'::jsonb |
| is_active | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| phone_width | integer | YES | 480 |
| phone_height | integer | YES | 1036 |


---

# Database Constraints


Auto-generated from Neon Postgres `information_schema.table_constraints` + `constraint_column_usage`.

### admin_audit_log

**Primary Key:** id

**Foreign Keys:**
- admin_id -> users(id)

### admin_notification_config

**Primary Key:** id

**Unique Constraints:**
- (notification_type)

### admin_sms_sent

**Primary Key:** id

**Foreign Keys:**
- admin_id -> users(id)
- recipient_id -> users(id)

### blocked_users

**Primary Key:** id

**Foreign Keys:**
- blocked_id -> users(id)
- blocker_id -> users(id)

**Unique Constraints:**
- (blocked_id, blocker_id)

### comments

**Primary Key:** id

**Foreign Keys:**
- author_id -> users(id)
- ride_id -> rides(id)
- subject_id -> users(id)

### content_prompts

**Primary Key:** id

### daily_earnings

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)

**Unique Constraints:**
- (driver_id, earnings_date)

### data_room_access_logs

**Primary Key:** id

**Foreign Keys:**
- consent_id -> data_room_consents(id)
- document_id -> data_room_documents(id)

**Check Constraints:**
- `(action = ANY (ARRAY['view'::text, 'download'::text]))`

### data_room_consents

**Primary Key:** id

### data_room_documents

**Primary Key:** id

**Check Constraints:**
- `(category = ANY (ARRAY['pitch_deck'::text, 'financials'::text, 'one_pager'::text, 'legal'::text, 'other'::text]))`

### disputes

**Primary Key:** id

**Foreign Keys:**
- filed_by -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `((status)::text = ANY ((ARRAY['open'::character varying, 'under_review'::character varying, 'resolved'::character varying, 'closed'::character varying])::text[]))`

### draft_bookings

**Primary Key:** id

**Foreign Keys:**
- rider_id -> users(id)

**Unique Constraints:**
- (rider_id, driver_handle)

### driver_bookings

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- market_id -> markets(id)
- ride_id -> rides(id)
- rider_id -> users(id)

**Check Constraints:**
- `(booking_type = ANY (ARRAY['ride'::text, 'recurring_ride'::text, 'blocked'::text, 'break'::text]))`
- `(status = ANY (ARRAY['confirmed'::text, 'pending'::text, 'cancelled'::text]))`

### driver_enrollment_offers

**Primary Key:** id

### driver_offer_enrollments

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- offer_id -> driver_enrollment_offers(id)

**Unique Constraints:**
- (driver_id)

**Check Constraints:**
- `(status = ANY (ARRAY['active'::text, 'exhausted'::text, 'expired'::text]))`

### driver_profiles

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

**Unique Constraints:**
- (handle)
- (user_id)

**Check Constraints:**
- `(payout_method = ANY (ARRAY['bank'::text, 'debit'::text, 'cash_app'::text, 'venmo'::text, 'zelle'::text, 'paypal'::text]))`
- `(subscription_status = ANY (ARRAY['free'::text, 'hmu_first'::text, 'past_due'::text]))`

### driver_schedules

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- market_id -> markets(id)

**Unique Constraints:**
- (driver_id, day_of_week)

**Check Constraints:**
- `((day_of_week >= 0) AND (day_of_week <= 6))`

### driver_service_areas

**Primary Key:** id

**Foreign Keys:**
- driver_profile_id -> driver_profiles(id)

### driver_service_menu

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- item_id -> service_menu_items(id)

**Unique Constraints:**
- (driver_id, item_id)

**Check Constraints:**
- `(pricing_type = ANY (ARRAY['flat'::text, 'per_unit'::text, 'per_minute'::text]))`

### hmu_posts

**Primary Key:** id

**Foreign Keys:**
- market_id -> markets(id)
- target_driver_id -> users(id)
- user_id -> users(id)

**Check Constraints:**
- `((post_type)::text = ANY ((ARRAY['driver_available'::character varying, 'rider_request'::character varying, 'direct_booking'::character varying])::text[]))`
- `((status)::text = ANY ((ARRAY['active'::character varying, 'matched'::character varying, 'expired'::character varying, 'cancelled'::character varying, 'completed'::character varying])::text[]))`

### hold_policy

**Primary Key:** id

**Check Constraints:**
- `(hold_mode = ANY (ARRAY['full'::text, 'deposit_percent'::text, 'deposit_fixed'::text]))`
- `(tier = ANY (ARRAY['free'::text, 'hmu_first'::text]))`

### leads

**Primary Key:** id

**Check Constraints:**
- `(lead_type = ANY (ARRAY['driver'::text, 'rider'::text]))`

### market_areas

**Primary Key:** id

**Foreign Keys:**
- market_id -> markets(id)

**Unique Constraints:**
- (market_id, slug)

### markets

**Primary Key:** id

**Unique Constraints:**
- (slug)
- (subdomain)

**Check Constraints:**
- `(status = ANY (ARRAY['setup'::text, 'soft_launch'::text, 'live'::text, 'paused'::text]))`

### notifications

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

### payouts

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `((timing_tier)::text = ANY ((ARRAY['free'::character varying, 'hmu_first'::character varying])::text[]))`

### platform_config

**Primary Key:** id

**Unique Constraints:**
- (config_key)

### price_negotiations

**Primary Key:** id

**Foreign Keys:**
- proposed_by -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `(status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text]))`

### pricing_config

**Primary Key:** id

**Foreign Keys:**
- changed_by -> users(id)

### rate_limit_counters

**Primary Key:** key

### ratings

**Primary Key:** id

**Foreign Keys:**
- rated_id -> users(id)
- rater_id -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `((rating_type)::text = ANY ((ARRAY['chill'::character varying, 'cool_af'::character varying, 'kinda_creepy'::character varying, 'weirdo'::character varying])::text[]))`

### ride_add_ons

**Primary Key:** id

**Foreign Keys:**
- menu_item_id -> driver_service_menu(id)
- ride_id -> rides(id)

**Check Constraints:**
- `(added_by = ANY (ARRAY['rider'::text, 'system'::text]))`
- `(status = ANY (ARRAY['pre_selected'::text, 'confirmed'::text, 'disputed'::text, 'adjusted'::text, 'removed'::text]))`

### ride_comments

**Primary Key:** id

**Foreign Keys:**
- ride_id -> rides(id)
- user_id -> users(id)

**Check Constraints:**
- `((comment_type)::text = ANY ((ARRAY['offer_counter'::character varying, 'question'::character varying, 'update'::character varying, 'general'::character varying])::text[]))`
- `(length(message) <= 500)`

### ride_interests

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- post_id -> hmu_posts(id)

**Unique Constraints:**
- (post_id, driver_id)

**Check Constraints:**
- `(status = ANY (ARRAY['interested'::text, 'selected'::text, 'passed'::text, 'expired'::text]))`

### ride_locations

**Primary Key:** id

**Foreign Keys:**
- ride_id -> rides(id)
- user_id -> users(id)

### ride_messages

**Primary Key:** id

**Foreign Keys:**
- ride_id -> rides(id)
- sender_id -> users(id)

### rider_payment_methods

**Primary Key:** id

**Foreign Keys:**
- rider_id -> users(id)

### rider_profiles

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

**Unique Constraints:**
- (handle)
- (user_id)

**Check Constraints:**
- `((driver_preference)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'no_preference'::character varying, 'women_only'::character varying, 'men_only'::character varying, 'prefer_women'::character varying, 'prefer_men'::character varying, 'any'::character varying])::text[]))`

### rides

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- market_id -> markets(id)
- rider_id -> users(id)

**Unique Constraints:**
- (ref_code)

**Check Constraints:**
- `((status)::text = ANY ((ARRAY['matched'::character varying, 'otw'::character varying, 'here'::character varying, 'confirming'::character varying, 'active'::character varying, 'ended'::character varying, 'disputed'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'refunded'::character varying])::text[]))`

### schedule_events

**Primary Key:** id

**Foreign Keys:**
- driver_id -> users(id)
- market_id -> markets(id)
- rider_id -> users(id)

**Check Constraints:**
- `(event_type = ANY (ARRAY['hours_set'::text, 'hours_updated'::text, 'booking_created'::text, 'booking_cancelled'::text, 'conflict_blocked'::text, 'time_blocked'::text, 'time_unblocked'::text]))`

### search_events

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

### service_menu_items

**Primary Key:** id

**Check Constraints:**
- `(pricing_type = ANY (ARRAY['flat'::text, 'per_unit'::text, 'per_minute'::text]))`

### sms_inbound

**Primary Key:** id

### sms_log

**Primary Key:** id

### support_conversations

**Primary Key:** id

**Foreign Keys:**
- market_id -> markets(id)
- ride_id -> rides(id)
- user_id -> users(id)

**Check Constraints:**
- `(status = ANY (ARRAY['open'::text, 'resolved'::text, 'escalated'::text]))`
- `(user_role = ANY (ARRAY['driver'::text, 'rider'::text]))`

### support_tickets

**Primary Key:** id

**Foreign Keys:**
- admin_id -> users(id)
- conversation_id -> support_conversations(id)
- market_id -> markets(id)
- ride_id -> rides(id)
- user_id -> users(id)

**Check Constraints:**
- `(category = ANY (ARRAY['rider_no_show'::text, 'rider_aggressive'::text, 'rider_damage'::text, 'payment_question'::text, 'payment_missing'::text, 'dispute_response'::text, 'driver_no_show'::text, 'driver_inappropriate'::text, 'driver_unsafe'::text, 'overcharged'::text, 'route_issue'::text, 'refund_request'::text, 'other'::text]))`
- `(severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))`
- `(status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]))`

### suspect_usage_events

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

### transaction_ledger

**Primary Key:** id

**Foreign Keys:**
- ride_id -> rides(id)
- user_id -> users(id)

**Check Constraints:**
- `(direction = ANY (ARRAY['debit'::text, 'credit'::text, 'hold'::text, 'release'::text, 'pending'::text]))`
- `(user_role = ANY (ARRAY['rider'::text, 'driver'::text, 'platform'::text]))`

### user_activity

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

### user_preferences

**Primary Key:** id

**Foreign Keys:**
- user_id -> users(id)

**Unique Constraints:**
- (user_id)

**Check Constraints:**
- `((driver_gender_pref)::text = ANY ((ARRAY['no_preference'::character varying, 'women_only'::character varying, 'men_only'::character varying, 'prefer_women'::character varying, 'prefer_men'::character varying])::text[]))`
- `((matching_priority)::text = ANY ((ARRAY['safety_first'::character varying, 'proximity_first'::character varying, 'price_first'::character varying, 'rating_first'::character varying])::text[]))`
- `((min_driver_rating >= (0)::numeric) AND (min_driver_rating <= 5.0))`
- `((min_rider_rating >= (0)::numeric) AND (min_rider_rating <= 5.0))`
- `((rider_gender_pref)::text = ANY ((ARRAY['no_preference'::character varying, 'women_only'::character varying, 'men_only'::character varying, 'prefer_women'::character varying, 'prefer_men'::character varying])::text[]))`

### user_reports

**Primary Key:** id

**Foreign Keys:**
- reported_id -> users(id)
- reporter_id -> users(id)
- resolved_by -> users(id)
- ride_id -> rides(id)

**Check Constraints:**
- `((reason)::text = ANY ((ARRAY['inappropriate_behavior'::character varying, 'safety_concern'::character varying, 'harassment'::character varying, 'discrimination'::character varying, 'dangerous_driving'::character varying, 'fraud'::character varying, 'other'::character varying])::text[]))`
- `((status)::text = ANY ((ARRAY['pending'::character varying, 'reviewing'::character varying, 'resolved'::character varying, 'dismissed'::character varying])::text[]))`

### users

**Primary Key:** id

**Foreign Keys:**
- market_id -> markets(id)
- referred_by_driver_id -> users(id)
- referred_via_hmu_post_id -> hmu_posts(id)

**Unique Constraints:**
- (clerk_id)

**Check Constraints:**
- `((account_status)::text = ANY ((ARRAY['pending_activation'::character varying, 'active'::character varying, 'suspended'::character varying, 'banned'::character varying])::text[]))`
- `((background_check_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'expired'::character varying])::text[]))`
- `((profile_type)::text = ANY ((ARRAY['rider'::character varying, 'driver'::character varying])::text[]))`
- `((tier)::text = ANY ((ARRAY['free'::character varying, 'hmu_first'::character varying])::text[]))`

### video_configs

**Primary Key:** id

**Unique Constraints:**
- (composition_id)
