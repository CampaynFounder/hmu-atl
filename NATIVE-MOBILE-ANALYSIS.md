# HMU ATL — Native Mobile App Analysis

> End-to-end analysis of the existing Next.js PWA codebase for repurposing into native iOS and Android apps.
> Generated: 2026-04-07

---

## Table of Contents

1. [API Analysis](#1-api-analysis)
2. [APIs That Cannot Be Repurposed](#2-apis-that-cannot-be-repurposed)
3. [Frontend Reusability](#3-frontend-reusability)
4. [Recommended Native Tech Stack](#4-recommended-native-tech-stack)
5. [Code Sharing Strategy](#5-code-sharing-strategy)

---

## 1. API Analysis

The app has **~115 API routes** in `app/api/`. The vast majority return JSON and are fully compatible with native mobile clients over HTTP. Below is the complete inventory grouped by category.

### Verdict: 95% of APIs are mobile-ready as-is

All API routes use standard REST conventions (JSON request/response) with Clerk JWT auth via `Authorization: Bearer <token>`. Native apps authenticate identically — Clerk issues JWTs on mobile the same way.

---

### 1.1 Webhooks (Server-to-Server — No Mobile Impact)

These are called by external services, not by the client. They remain unchanged.

| Endpoint | Provider | Purpose |
|---|---|---|
| `POST /api/webhooks/clerk` | Clerk (Svix) | user.created/updated/deleted → Neon sync, Stripe provisioning |
| `POST /api/webhooks/stripe` | Stripe | payment_intent.*, account.updated, transfer.*, subscription.*, charge.*, payout.* |
| `POST /api/webhooks/voipms` | VoIP.ms | Inbound SMS → sms_inbound table + admin alert |

**Mobile impact:** None. These stay server-side.

---

### 1.2 Auth & User Profile

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/users/me` | GET | Returns `{ id, profileType, accountStatus }` | Yes |
| `/api/users/profile` | GET, PATCH | Full profile (user + rider/driver profiles) | Yes |
| `/api/users/activity` | GET | User activity log | Yes |
| `/api/users/onboarding` | GET, POST | Onboarding step tracking | Yes |
| `/api/users/pending-actions` | GET | Outstanding actions list | Yes |
| `/api/users/personalization` | GET, POST | User preferences | Yes |

**Mobile notes:** All JSON. Clerk JWT auth. No changes needed.

---

### 1.3 Ably Realtime Token

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/ably/token` | POST | Issues scoped Ably token (1hr TTL) | Yes |

**Mobile notes:** Critical endpoint. Native app calls this on launch and token refresh. Ably JS SDK works in React Native. Token scoping (user channels, ride channels, area feeds) is unchanged.

---

### 1.4 Rider Endpoints

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/rider/posts` | GET, POST, DELETE | Create/list/cancel ride requests | Yes |
| `/api/rider/draft-booking` | POST | Save draft booking | Yes |
| `/api/rider/payment-methods` | GET | List saved payment methods | Yes |
| `/api/rider/payment-methods/setup-intent` | POST | Create Stripe SetupIntent | Yes |
| `/api/rider/payment-methods/save` | POST | Save new payment method | Yes |
| `/api/rider/payment-methods/checkout` | POST | Stripe checkout session | **See note** |
| `/api/rider/[handle]` | GET | Public rider profile | Yes |
| `/api/feed/riders` | GET | Browse available drivers | Yes |

**Note on checkout:** If this redirects to a Stripe Checkout web page, native apps should use Stripe Mobile SDK's `PaymentSheet` instead. The server endpoint that creates the checkout session is reusable — only the client-side rendering changes.

---

### 1.5 Driver Endpoints

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/driver/posts` | GET, POST, DELETE | Availability posts (go live/offline) | Yes |
| `/api/driver/earnings` | GET | Today/week earnings breakdown | Yes |
| `/api/driver/earnings-audit` | GET | Detailed earnings audit | Yes |
| `/api/driver/analytics` | GET | Driver performance analytics | Yes |
| `/api/driver/balance` | GET | Current balance | Yes |
| `/api/driver/dashboard` | GET | Dashboard summary | Yes |
| `/api/driver/cash-packs` | GET, POST | Cash pack management | Yes |
| `/api/driver/cashout` | POST | Trigger cashout | Yes |
| `/api/driver/schedule` | GET, POST | Schedule management | Yes |
| `/api/driver/service-menu` | GET, POST | Service menu items | Yes |
| `/api/driver/enrollment` | GET, POST | Enrollment/onboarding | Yes |
| `/api/driver/upgrade` | POST | Upgrade to HMU First | Yes |
| `/api/driver/upgrade-inline` | POST | Inline upgrade flow | Yes |
| `/api/driver/payment-setup` | GET, POST | Payment setup status | Yes |
| `/api/driver/payout-setup` | GET, POST | Payout configuration | Yes |
| `/api/driver/payout-setup/session` | POST | Stripe embedded session | **See note** |
| `/api/driver/payout-setup/update` | PATCH | Update payout prefs | Yes |
| `/api/driver/payout-setup/bank` | POST | Add bank account | Yes |
| `/api/driver/onboarding/start` | POST | Stripe Connect onboarding link | **See note** |
| `/api/driver/[handle]` | GET | Public driver profile | Yes |
| `/api/drivers/check-handle` | GET | Handle availability check | Yes |
| `/api/drivers/availability` | GET | Driver availability status | Yes |
| `/api/drivers/[handle]/book` | POST | Direct booking | Yes |
| `/api/drivers/[handle]/eligibility` | GET | Driver eligibility check | Yes |
| `/api/drivers/booking-settings` | GET, PATCH | Booking preferences | Yes |
| `/api/drivers/requests` | GET | Incoming ride requests | Yes |
| `/api/drivers/location` | POST | Broadcast driver location | Yes |

**Notes:**
- **Payout setup session**: Returns a Stripe `clientSecret` for embedded onboarding. On native, use Stripe's `ConnectAccountManagement` component from `@stripe/stripe-react-native`.
- **Onboarding start**: Returns an `onboardingUrl` (web link). On native, open in an in-app browser (WebView or `expo-web-browser`) with deep-link return URL.

---

### 1.6 Booking Flow

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/bookings/[postId]/accept` | POST | Driver accepts/expresses interest | Yes |
| `/api/bookings/[postId]/decline` | POST | Driver declines | Yes |
| `/api/bookings/[postId]/select` | POST | Rider selects driver from interested list | Yes |

**Mobile notes:** All JSON. The SMS notification side-effect (driver accepted) fires server-side.

---

### 1.7 Ride Lifecycle

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/rides/request` | POST | Create ride request (Zod validated) | Yes |
| `/api/rides/active` | GET | Check for active ride | Yes |
| `/api/rides/history` | GET | Ride history | Yes |
| `/api/rides/schedule` | GET, POST | Scheduled rides | Yes |
| `/api/rides/nearby-drivers` | GET | Find nearby available drivers | Yes |
| `/api/rides/[id]` | GET | Ride details | Yes |
| `/api/rides/[id]/accept` | POST | Accept ride | Yes |
| `/api/rides/[id]/cancel` | POST | Cancel ride (state-dependent) | Yes |
| `/api/rides/[id]/otw` | POST | Driver en route | Yes |
| `/api/rides/[id]/here` | POST | Driver arrived | Yes |
| `/api/rides/[id]/start` | POST | Start ride (proximity check) | Yes |
| `/api/rides/[id]/confirm-start` | POST | Rider confirms ride start | Yes |
| `/api/rides/[id]/end` | POST | End ride | Yes |
| `/api/rides/[id]/complete` | POST | Complete ride (after rating) | Yes |
| `/api/rides/[id]/rate` | POST | Submit rating | Yes |
| `/api/rides/[id]/location` | POST | GPS location update | Yes |
| `/api/rides/[id]/messages` | GET, POST | In-ride chat | Yes |
| `/api/rides/[id]/menu` | GET | In-ride menu options | Yes |
| `/api/rides/[id]/add-stop` | POST | Add stop to ride | Yes |
| `/api/rides/[id]/add-ons` | POST | Tips/fees | Yes |
| `/api/rides/[id]/update-price` | POST | Price negotiation | Yes |
| `/api/rides/[id]/extend-wait` | POST | Extend wait time | Yes |
| `/api/rides/[id]/eta-nudge` | POST | ETA nudge notification | Yes |
| `/api/rides/[id]/stop-reached` | POST | Mark stop reached | Yes |
| `/api/rides/[id]/pulloff` | POST | Emergency pull-off | Yes |

**Mobile notes:** All JSON REST. The location endpoint is high-frequency (every 10s or 50m) — native apps should batch and use background location services (iOS: significant location changes, Android: foreground service).

---

### 1.8 Payments

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/payments/methods` | GET | General payment methods | Yes |

---

### 1.9 Support & Chat

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/chat/support` | POST | AI support chat (GPT-4o-mini) | Yes |
| `/api/chat/booking` | POST | Booking chat | Yes |

**Mobile notes:** Returns `{ reply: string }`. Handle async response display on native.

---

### 1.10 Media Upload

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/upload/video` | POST | Upload video/image (50MB max, FormData) | Yes |

**Mobile notes:** Use `FormData` with `react-native-image-picker` or `expo-image-picker`. Add upload progress tracking (not currently implemented). Consider chunked upload for poor network conditions.

---

### 1.11 Search & Tracking

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/search/track` | POST | Search analytics tracking | Yes |

---

### 1.12 Admin Endpoints (Not for Consumer Mobile)

These are admin-only and would be accessed via a separate admin app or web dashboard:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/admin/users` | GET, PATCH, DELETE | User management |
| `/api/admin/users/[id]` | GET, PATCH, DELETE | User details |
| `/api/admin/users/pending` | GET | Pending users queue |
| `/api/admin/disputes` | GET, POST | Dispute management |
| `/api/admin/disputes/[id]` | GET, PATCH | Dispute details |
| `/api/admin/disputes/[id]/analyze` | POST | AI dispute analysis |
| `/api/admin/stats` | GET | Dashboard metrics |
| `/api/admin/alerts` | GET | System alerts |
| `/api/admin/rides/active` | GET | Active rides monitoring |
| `/api/admin/messages` | GET | Message management |
| `/api/admin/messages/unread` | GET | Unread count |
| `/api/admin/money` | GET | Financial overview |
| `/api/admin/money/ledger` | GET | Transaction ledger |
| `/api/admin/markets` | GET | Market management |
| `/api/admin/switch-role` | POST | Role masquerading |
| `/api/admin/grant` | POST | Permission management |
| `/api/admin/refund-pi` | POST | Manual refund |
| `/api/admin/schedule-analytics` | GET | Schedule analytics |
| `/api/admin/content/generate` | POST | AI content generation |
| `/api/admin/content/prompts` | GET, POST | Content prompts |
| `/api/admin/marketing/send` | POST | SMS/email broadcasts |
| `/api/admin/data-room/*` | Various | Data room management |

**Mobile impact:** Exclude from consumer app. If admin mobile app is needed, all endpoints are JSON-ready.

---

### 1.13 Data Room (Investor Portal)

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/data-room/consent` | POST | NDA consent | Yes (if needed) |
| `/api/data-room/documents` | GET | List documents | Yes (if needed) |
| `/api/data-room/documents/[id]/download` | GET | Download document | Yes (if needed) |
| `/api/data-room/documents/upload` | POST | Upload document | Yes (if needed) |
| `/api/data-room/verify` | POST | Verify access code | Yes (if needed) |

**Mobile impact:** Not needed for consumer app. Admin/investor use only.

---

### 1.14 Public/Marketing Endpoints

| Endpoint | Method | Purpose | Mobile-Ready? |
|---|---|---|---|
| `/api/og/driver` | GET | Dynamic OG image (1200x630px) | N/A |
| `/api/meta-verify` | GET | Meta domain verification token | N/A |

**Mobile impact:** Not applicable. OG images are for social link previews. Meta verification is web-only.

---

## 2. APIs That Cannot Be Repurposed

Only **5 out of ~115 endpoints** have issues for native mobile:

### 2.1 Cannot be used on native (web-only)

| Endpoint | Issue | Native Alternative |
|---|---|---|
| `GET /api/og/driver` | Returns `ImageResponse` (HTML canvas-rendered PNG). Uses `next/og` which is a Next.js-specific image generation API. | Not needed on mobile. OG images are for social media link previews, not in-app rendering. |
| `GET /api/meta-verify` | Returns plain text for Meta domain verification. Web-only concern. | Not applicable to mobile apps. |

### 2.2 Requires native SDK swap (server endpoint reusable, client integration changes)

| Endpoint | Issue | Native Approach |
|---|---|---|
| `POST /api/rider/payment-methods/checkout` | If this creates a Stripe Checkout Session with a redirect URL, mobile apps can't follow web redirects. | Use the same server endpoint but render payment UI with `@stripe/stripe-react-native` `PaymentSheet` instead of Stripe Checkout redirect. |
| `POST /api/driver/payout-setup/session` | Returns Stripe embedded component `clientSecret`. Web uses `<ConnectPayouts>` React component. | Use `@stripe/stripe-react-native`'s `ConnectAccountManagement` or open Stripe's hosted onboarding in `expo-web-browser`. |
| `POST /api/driver/onboarding/start` | Returns `onboardingUrl` — a Stripe Connect onboarding web link. | Open in `expo-web-browser` or in-app WebView. Set `return_url` to a deep link (`hmuatl://stripe-return`). Works but requires deep link handling. |

### 2.3 Needs mobile-specific optimization (works but should be enhanced)

| Endpoint | Concern | Recommendation |
|---|---|---|
| `POST /api/rides/[id]/location` | Called every 10s during active rides. On mobile, app may be backgrounded. | Use native background location services (iOS: `startMonitoringSignificantLocationChanges`, Android: foreground service with notification). Batch updates when returning to foreground. |
| `POST /api/upload/video` | 50MB upload limit. Mobile networks are unreliable. | Add resumable upload support (tus protocol or multipart with retry). Show upload progress bar. Compress video on-device before upload. |

### Summary

| Category | Count | % of Total |
|---|---|---|
| Fully mobile-ready (no changes) | ~88 | ~77% |
| Mobile-ready but admin-only (exclude from consumer app) | ~22 | ~19% |
| Needs native SDK swap (server reusable) | 3 | ~3% |
| Web-only (not needed on mobile) | 2 | ~1% |

**Bottom line: The entire API layer is ready for native mobile consumption.** The server stays exactly as-is. Only 3 endpoints need client-side integration changes (Stripe flows), and those changes are on the mobile app side, not the API side.

---

## 3. Frontend Reusability

### 3.1 Business Logic — Directly Portable (copy to native)

These files contain zero web/DOM dependencies. They can be copied directly into a React Native project:

| File | What It Does | Reusability |
|---|---|---|
| `lib/geo/distance.ts` | Haversine formula, bounding boxes, ETA estimation | 100% — pure math |
| `lib/rides/state-machine.ts` | Ride status enum, transition validation, display messages | 100% — pure logic |
| `lib/payments/fee-calculator.ts` | Platform fee tiers, daily/weekly caps, Stripe fee math | 100% — pure math |
| `lib/schedule/parse-time.ts` | Natural language time parsing ("tomorrow 2pm" → Date) | 100% — pure date math |
| `lib/mapbox/search.ts` | Mapbox address autocomplete (REST API wrapper) | 100% — just fetch() |
| `lib/db/types.ts` | All TypeScript interfaces (User, Ride, DriverProfile, etc.) | 100% — type definitions |
| `lib/schedule/conflicts.ts` | Schedule conflict detection | 100% — pure logic |

### 3.2 Hooks — Portable with Minor Swaps

| Hook | What It Does | Reusability | Swap Needed |
|---|---|---|---|
| `hooks/use-ably.ts` | Ably WebSocket connection, subscribe/publish | 100% | Ably JS SDK works in React Native |
| `hooks/use-pending-actions.ts` | Polling + caching for pending actions | 95% | `localStorage` → `AsyncStorage` |
| `hooks/use-geolocation.ts` | GPS tracking with interval & dedup | 70% | `navigator.geolocation` → `expo-location` |

### 3.3 Server-Side Logic — Stays on Server (accessed via API)

These files run server-side and are accessed by the mobile app through the existing API endpoints:

| File | Purpose | Mobile Impact |
|---|---|---|
| `lib/db/client.ts` | Neon connection pool | Stays server-side |
| `lib/db/users.ts`, `profiles.ts`, etc. | Database queries | Stays server-side |
| `lib/stripe/client.ts` | Stripe API calls | Stays server-side |
| `lib/stripe/rider-payments.ts` | Payment method management | Stays server-side |
| `lib/stripe/connect.ts` | Connect account operations | Stays server-side |
| `lib/auth/get-current-user.ts` | Clerk server auth (`currentUser()`) | Stays server-side |
| `lib/auth/guards.ts` | Route authorization | Stays server-side |
| `lib/ably/server.ts` | Ably token generation | Stays server-side |
| `lib/sms/textbee.ts` | SMS sending | Stays server-side |
| `lib/payments/escrow.ts` | Escrow logic | Stays server-side |

### 3.4 Components — Require Full Rewrite for Native

**48 components** in `/components/` + 6 in `/app/admin/components/`. None are directly portable because they use React DOM elements (`<div>`, `<input>`, `<button>`, etc.).

However, the app uses **inline styles throughout** (no Tailwind classes in JSX), which makes conversion to React Native `StyleSheet` straightforward.

**Key component categories and native equivalents:**

| Web Component | Native Equivalent |
|---|---|
| `components/ride/address-autocomplete.tsx` | React Native `TextInput` + `FlatList` dropdown (reuse `lib/mapbox/search.ts` logic) |
| `components/ride/ride-chat.tsx` | React Native `FlatList` + `TextInput` (reuse Ably hook) |
| `components/feed/rider-feed.tsx` | React Native `FlatList` with `rider-feed-card` |
| `components/feed/driver-feed.tsx` | React Native `FlatList` with `driver-feed-card` |
| `components/payments/inline-payment-form.tsx` | `@stripe/stripe-react-native` `CardField` + `PaymentSheet` |
| `components/onboarding/video-recorder.tsx` | `expo-camera` or `react-native-camera` |
| `components/onboarding/location-permission.tsx` | `expo-location` permissions API |
| `components/support/support-chat.tsx` | React Native chat UI (reuse API logic) |
| `components/analytics/posthog-provider.tsx` | `posthog-react-native` SDK |
| `components/analytics/meta-pixel.tsx` | Meta App Events SDK (iOS/Android native) |
| `components/auth/in-app-browser-gate.tsx` | Not needed on native |

### 3.5 Pages — Require Full Rewrite (Navigation Architecture)

**45 page routes** use Next.js file-based routing. These become React Navigation screens on native.

**Mapping (consumer app only, excluding admin/marketing/data-room):**

| Web Route | Native Screen | Notes |
|---|---|---|
| `/` | `HomeScreen` | Landing → sign-in prompt |
| `/sign-in` | `SignInScreen` | Clerk `@clerk/expo` `<SignIn>` |
| `/sign-up` | `SignUpScreen` | Clerk `@clerk/expo` `<SignUp>` |
| `/auth-callback` | Deep link handler | Handle OAuth return |
| `/pending` | `PendingActivationScreen` | Waiting for admin approval |
| `/rider/home` | `RiderHomeScreen` | Main rider dashboard |
| `/rider/browse` | `RiderBrowseScreen` | Browse available drivers |
| `/rider/profile` | `RiderProfileScreen` | Profile management |
| `/rider/settings` | `RiderSettingsScreen` | Settings & payment methods |
| `/rider/support` | `RiderSupportScreen` | AI support chat |
| `/driver/home` | `DriverHomeScreen` | Main driver dashboard |
| `/driver/feed` | `DriverFeedScreen` | Incoming ride requests |
| `/driver/go-live` | `DriverGoLiveScreen` | Post availability |
| `/driver/dashboard` | `DriverDashboardScreen` | Earnings dashboard |
| `/driver/profile` | `DriverProfileScreen` | Profile management |
| `/driver/settings` | `DriverSettingsScreen` | Settings |
| `/driver/payout-setup` | `DriverPayoutScreen` | Payout configuration |
| `/driver/rides` | `DriverRidesScreen` | Ride history |
| `/driver/schedule` | `DriverScheduleScreen` | Schedule management |
| `/driver/support` | `DriverSupportScreen` | AI support chat |
| `/ride/[id]` | `ActiveRideScreen` | Active ride with map |
| `/d/[handle]` | `DriverPublicProfile` | Deep link to driver profile |
| `/guide/driver` | `DriverGuideScreen` | How-to guide |
| `/guide/rider` | `RiderGuideScreen` | How-to guide |
| `/privacy` | WebView or native text | Legal page |
| `/terms` | WebView or native text | Legal page |

### 3.6 State Management — Fully Portable

The app uses **no global state library** (no Redux, Zustand, etc.). State is managed via:

- `useState()` / `useRef()` in components — same on React Native
- React Context (1 usage: `MarketContext`) — same on React Native
- `localStorage` for caching — swap to `AsyncStorage`

### 3.7 Realtime (Ably) — Fully Portable

- Ably JS SDK works in React Native
- `use-ably.ts` hook works unchanged
- Token auth via `/api/ably/token` works unchanged
- Channel architecture (`ride:{id}`, `user:{id}:notify`, `area:{slug}:feed`) unchanged

### 3.8 Maps — Rendering Requires Native SDK

| Concern | Web (Current) | Native |
|---|---|---|
| Address search | Mapbox REST API via `lib/mapbox/search.ts` | Same — 100% reusable |
| Map rendering | Mapbox GL JS (CDN script tag) | `@rnmapbox/maps` (React Native Mapbox) |
| Route display | Mapbox Directions API | Same API, render with `@rnmapbox/maps` |
| Live location marker | Mapbox GL JS marker updates | `@rnmapbox/maps` `<PointAnnotation>` |

### 3.9 Auth (Clerk) — SDK Swap Required

| Concern | Web (Current) | Native |
|---|---|---|
| Package | `@clerk/nextjs` | `@clerk/expo` |
| Hook | `useUser()` from `@clerk/nextjs` | `useUser()` from `@clerk/expo` (same API) |
| Sign-in UI | `<SignIn>` component | `<SignIn>` component (Clerk provides native UI) |
| Token | Auto-attached by Next.js middleware | Manually attach JWT via `getToken()` in fetch headers |
| OAuth return | Web redirect to `/auth-callback` | Deep link `hmuatl://auth-callback` |

---

## 4. Recommended Native Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Framework | **React Native + Expo** | Shared JS business logic with web, Expo handles native APIs |
| Navigation | **React Navigation** (native stack) | Industry standard, deep link support |
| Auth | **@clerk/expo** | Same Clerk backend, similar hook API |
| Maps | **@rnmapbox/maps** | Same Mapbox backend, native performance |
| Payments | **@stripe/stripe-react-native** | Same Stripe backend, Apple Pay/Google Pay native |
| Realtime | **Ably JS SDK** | Works in React Native, same channel architecture |
| Location | **expo-location** | Background location, geofencing, permissions |
| Camera/Video | **expo-camera** + **expo-image-picker** | Video recording, photo capture |
| Storage | **@react-native-async-storage/async-storage** | Replace localStorage |
| Analytics | **posthog-react-native** | Same PostHog backend |
| Push Notifications | **expo-notifications** + APNs/FCM | Replace web push |
| Error Tracking | **@sentry/react-native** | Same Sentry backend |
| HTTP Client | **fetch** (built-in) or **axios** | Same REST API calls |
| Styling | **StyleSheet** (built-in) | Inline styles convert easily |

---

## 5. Code Sharing Strategy

### Proposed Monorepo Structure

```
hmu-atl/
├── apps/
│   ├── web/              ← Current Next.js PWA (move here)
│   └── mobile/           ← New React Native app
│       ├── ios/
│       ├── android/
│       ├── app/           ← Expo Router or React Navigation screens
│       └── components/    ← Native UI components
├── packages/
│   └── shared/           ← Extracted from current lib/
│       ├── types/         ← lib/db/types.ts
│       ├── geo/           ← lib/geo/distance.ts
│       ├── rides/         ← lib/rides/state-machine.ts
│       ├── payments/      ← lib/payments/fee-calculator.ts
│       ├── schedule/      ← lib/schedule/parse-time.ts, conflicts.ts
│       └── mapbox/        ← lib/mapbox/search.ts
└── server/               ← API stays as-is (Next.js API routes)
```

### Reusability Summary

| Category | Files | Reusability | Effort |
|---|---|---|---|
| API endpoints | ~115 routes | 95% as-is | Zero (server unchanged) |
| Business logic (lib/) | 7 files | 100% copy-paste | Low |
| Custom hooks | 3 files | 70-100% | Low (minor swaps) |
| TypeScript types | 1 file | 100% copy-paste | Zero |
| UI components | 48 files | 0% (rewrite) | High |
| Page routes | 45 files | 0% (rewrite) | High |
| State management | N/A | 100% (same patterns) | Zero |
| Ably realtime | 2 files | 100% | Zero |

### Estimated Code Reuse: ~35-40% of total codebase

- **100% of server/API code** — zero changes
- **100% of business logic** — copy directly
- **0% of UI code** — full native rewrite required
- **~70% of integration patterns** (Ably, Mapbox search, auth flow) — swap SDK, keep logic

---

## 6. Market Expansion Architecture

### Current State: Hardcoded to Atlanta

The codebase is tightly coupled to Atlanta in 6 specific places:

| File | What's Hardcoded |
|---|---|
| `lib/geo/distance.ts:86-99` | `ATLANTA_BOUNDS` object + `isInAtlantaMetro()` function |
| `lib/mapbox/search.ts:7` | `ATLANTA_BBOX = '-84.8,33.5,-84.1,34.1'` restricts address autocomplete |
| `app/api/rides/request/route.ts:86-91` | Rejects any pickup/dropoff outside ATL bounds |
| `app/api/driver/posts/route.ts:74` | Areas default to `['ATL']` if driver profile has none |
| `app/api/rider/posts/route.ts:98` | Rider posts hardcoded to `['ATL']` area array |
| `app/api/rider/posts/route.ts:108` | Publishes to `'area:atl:feed'` Ably channel (not dynamic) |

### Existing Multi-Market Infrastructure (Unused)

The schema has foundation pieces that were never wired up:

- **`markets` table** exists (in `lib/db/migrations/admin-portal.sql`) with: `slug`, `display_name`, `state`, `timezone`, `geo_center_lat`, `geo_center_lng`, `geo_radius_miles`, `areas TEXT[]`, `settings JSONB`
- **`market` TEXT column** exists on `users`, `rides`, `hmu_posts` — all default to `'atl'`, never queried
- **SMS DID mapping** in `lib/sms/textbee.ts` already has stubs for `hou`, `dal`, `mem`
- **Admin endpoint** `GET /api/admin/markets` reads from `markets` table but references columns (`name`, `status`, `market_areas`) that don't match the actual schema (`display_name`, `is_active`, no `market_areas` table)

### Recommended Approach: GPS-First, No Hard Boundaries

Instead of locking drivers into predefined service areas:

1. **Detect location via GPS** → reverse-geocode to nearest market
2. **Driver confirms or overrides** ("You're in Houston — driving here?" / "Actually heading to Dallas")
3. **No boundaries on who can drive where** — a driver visiting Memphis can go live there
4. **Markets are config rows** — adding a city = inserting a row in `markets` table
5. **Areas within a market are tags, not gates** — "Midtown", "Eastside" help discoverability but don't restrict

### Three GPS States on App Open

| GPS Result | What User Sees |
|---|---|
| Inside a **live** market | Normal app — "You're in Houston. Driving here today?" |
| Inside a **planned** market | "We're coming to Memphis soon. Want to be first?" → waitlist capture (name, phone, areas) |
| **No market** nearby | "We're not in your city yet. Tell us where to launch next." → city request form |

The planned/no-market screens are informational gates — user can't go live, but demand data feeds `min_drivers_to_launch` threshold on the markets table.

### API Changes Required for Multi-Market

No new routes needed. One optional new route + modifications to 6 existing routes:

| Change | Route/File | What Changes |
|---|---|---|
| **New (optional)** | `GET /api/markets/detect?lat=X&lng=Y` | Returns nearest market + status (live/planned/none) |
| **Modify** | `lib/geo/distance.ts` | Replace `isInAtlantaMetro()` with `isInServiceArea()` that queries markets table |
| **Modify** | `lib/mapbox/search.ts` | Accept `bbox` param instead of hardcoded `ATLANTA_BBOX` |
| **Modify** | `app/api/rides/request/route.ts` | Use `isInServiceArea()` instead of `isInAtlantaMetro()` |
| **Modify** | `app/api/driver/posts/route.ts` | Resolve driver's market from GPS/profile, use market areas |
| **Modify** | `app/api/rider/posts/route.ts` | Publish to `area:{market_slug}:feed` instead of hardcoded `area:atl:feed` |
| **Modify** | `app/api/ably/token/route.ts` | Already grants `area:*:feed` wildcard — no change needed |

### Market Detection Flow

```
Driver opens app
  → GPS: 29.760, -95.370
  → GET /api/markets/detect?lat=29.760&lng=-95.370
  → Response: { market: { slug: 'hou', name: 'Houston', status: 'live', areas: [...] }, distance: 0.3 }
  → App: "You're in Houston. Driving here today?"
  → Driver confirms → posts publish to area:hou:feed
  → Driver flies to Atlanta next week → same flow, now posting to area:atl:feed
```

### New Utility: `lib/geo/markets.ts`

Replaces all Atlanta-specific code with market-agnostic equivalents:

```typescript
// Given GPS coords, find which market the user is in (queries markets table)
async function resolveMarket(lat: number, lng: number): Promise<Market | null>

// Get bounding box for Mapbox search scoped to a market
function getMarketBbox(market: Market): string

// Check if coordinates are within any active market (replaces isInAtlantaMetro)
async function isInServiceArea(lat: number, lng: number): Promise<boolean>
```

---

## 7. App Architecture & In-App Purchases

### One App, Not Two

The native app is a **single app** for both riders and drivers. The existing `profileType` field (`rider` | `driver` | `admin`) gates the experience — rider sees rider tabs, driver sees driver tabs.

**Why one app:**
- Users already pick rider or driver at signup (existing flow)
- One codebase, one App Store listing, one review cycle
- Reduces maintenance burden for a startup
- User can switch roles if needed (future)

### In-App Purchase Strategy

Apple and Google require their IAP system for digital goods/services sold in-app. But real-world services (rides) are **exempt**.

| Revenue Type | IAP Required? | Handling |
|---|---|---|
| **Ride payments** | No — real-world physical service, exempt per Apple/Google policy | Keep using Stripe directly. Apple/Google cannot take a cut. |
| **HMU First subscription ($9.99/mo)** | Yes if sold in-app — this is a digital feature unlock | See strategy options below |
| **Cash packs** | Likely yes — digital consumable | Evaluate per Apple's guidelines |

### HMU First Subscription — Three Options

| Option | How It Works | Platform Cut | Net Revenue |
|---|---|---|---|
| **A. Web-only (recommended for launch)** | Don't offer subscription purchase in native app. Show upgrade CTA that opens `atl.hmucashride.com/driver/upgrade` in browser. Subscription status syncs back via API. | 0% | $9.99 |
| **B. IAP only** | Offer subscription via Apple/Google IAP. They take 15% (Small Business Program year 1) or 30%. | 15-30% | $7.00-$8.49 |
| **C. Hybrid pricing** | Offer in-app at $12.99 (covers platform cut), web at $9.99. Users self-select. | 15-30% on in-app | ~$9.99 effective |

**Recommendation: Option A for launch.** Keep Stripe billing on web. The native app shows subscription status, benefits, and a "Subscribe" button that opens the web upgrade page via `expo-web-browser`. No IAP integration needed at launch. Add IAP later if conversion data shows users won't leave the app to subscribe.

### What the Native App Shows for HMU First

- **Not subscribed**: Badge/CTA on driver dashboard — "Go HMU First: instant payouts, lower fees, priority placement" → opens web subscription page
- **Already subscribed**: HMU First badge, instant payout option enabled, lower fee display in earnings
- **Status check**: `GET /api/users/profile` already returns `tier: 'free' | 'hmu_first'` — no new endpoint needed

### App Store Compliance Notes

- Ride payments via Stripe: **Allowed** — Apple's guidelines explicitly exempt real-world goods/services (Section 3.1.3(e))
- Linking to web for subscription: **Allowed** — apps can inform users of purchase options outside the app (post-2024 ruling), but cannot use in-app buttons that directly link to external payment in some regions. Use `expo-web-browser` to open the subscription page.
- Push notification for subscription upsell: **Allowed** — can promote HMU First via push as long as the purchase happens on web or via IAP
- If you later add IAP: Use `expo-iap` or `react-native-iap` library. Server must validate receipts via Apple/Google APIs before granting access.

---

## Next Steps

1. **Phase 1**: Extract shared business logic into `packages/shared/`
2. **Phase 2**: Scaffold React Native app with Expo, configure Clerk + Stripe + Ably
3. **Phase 3**: Build core screens (auth → home → feed → ride lifecycle)
4. **Phase 4**: Active ride screen (maps, GPS tracking, real-time updates)
5. **Phase 5**: Payments, ratings, support chat
6. **Phase 6**: Push notifications (APNs + FCM)
7. **Phase 7**: Market detection + multi-market gating UI
8. **Phase 8**: App Store / Play Store submission
