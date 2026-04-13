# HMU ATL — Native Mobile App Build Prompt

> Copy-paste this entire file as your prompt in a new Claude Code session.
> Run it from the `/hmu-atl` project root directory.

---

## Context

HMU ATL is a mobile-first PWA (Next.js) peer-to-peer ride platform for Metro Atlanta. The web app is fully built with ~115 API routes, Clerk auth, Stripe payments, Ably realtime, Mapbox maps, and Neon Postgres.

We are building a **React Native (Expo)** app that targets **iOS and Android** from a single codebase. The existing Next.js API layer stays as-is — the native app is a new client that talks to the same backend.

Read these files before starting:
- `CLAUDE.md` — full project spec (schema, ride flow, monetization, Ably channels, Stripe integration, etc.)
- `NATIVE-MOBILE-ANALYSIS.md` — complete API inventory and frontend reusability analysis

## App Architecture

**One app for both riders and drivers.** The existing `profileType` field (`rider` | `driver`) gates the experience — rider sees rider tabs, driver sees driver tabs. Do NOT build two separate apps.

## What You're Building

A React Native + Expo app in a new `/mobile` directory at the project root. This app:

1. **Consumes the existing API** at `https://atl.hmucashride.com/api/*` (every endpoint documented in `NATIVE-MOBILE-ANALYSIS.md`)
2. **Shares business logic** extracted from the web app (see "Shared Code" below)
3. **Replaces web-specific SDKs** with native equivalents (see "SDK Swaps" below)
4. **Rebuilds all UI** using React Native components (the web app uses inline styles — reference those for design intent)
5. **Supports multi-market** via GPS-based market detection (see "Market Expansion" below)
6. **No in-app purchases at launch** — subscriptions handled via web (see "IAP Strategy" below)

## Tech Stack (Locked)

| Layer | Package |
|---|---|
| Framework | Expo SDK 52+ (managed workflow) |
| Navigation | Expo Router (file-based, like Next.js) |
| Auth | @clerk/clerk-expo |
| Maps | @rnmapbox/maps |
| Payments | @stripe/stripe-react-native |
| Realtime | ably (JS SDK — works in RN) |
| Location | expo-location |
| Camera | expo-camera + expo-image-picker |
| Storage | @react-native-async-storage/async-storage |
| Analytics | posthog-react-native |
| Push Notifications | expo-notifications |
| Error Tracking | @sentry/react-native |
| Styling | React Native StyleSheet (no NativeWind/Tailwind) |

## Shared Code — Copy These from Web App

Copy these files into `/mobile/shared/` and import them. Do NOT rewrite — they are platform-agnostic:

| Source File | Purpose |
|---|---|
| `lib/db/types.ts` | All TypeScript interfaces (User, Ride, DriverProfile, etc.) |
| `lib/geo/distance.ts` | Haversine formula, bounding boxes, ETA estimation |
| `lib/rides/state-machine.ts` | Ride status enum, valid transitions, display labels |
| `lib/payments/fee-calculator.ts` | Platform fee tiers, daily/weekly caps, payout math |
| `lib/schedule/parse-time.ts` | Natural language time → Date parsing |
| `lib/schedule/conflicts.ts` | Schedule conflict detection |
| `lib/mapbox/search.ts` | Mapbox address autocomplete (REST API fetch wrapper) |
| `hooks/use-ably.ts` | Ably connection + subscribe/publish hook |

For `hooks/use-pending-actions.ts` and `hooks/use-geolocation.ts`, copy the logic but swap:
- `localStorage` → `AsyncStorage`
- `navigator.geolocation` → `expo-location`

## SDK Swaps — What Changes on Native

| Concern | Web (Current) | Native (New) |
|---|---|---|
| Auth hooks | `useUser()` from `@clerk/nextjs` | `useUser()` from `@clerk/clerk-expo` |
| Auth token for API calls | Auto-attached by Next.js middleware | `getToken()` from `useAuth()`, attach as `Authorization: Bearer <token>` header |
| Sign-in/up UI | `<SignIn>` from `@clerk/nextjs` | `<SignIn>` from `@clerk/clerk-expo` |
| OAuth callback | Web redirect to `/auth-callback` | Deep link `hmuatl://auth-callback` |
| Map rendering | Mapbox GL JS (CDN script) | `@rnmapbox/maps` `<MapView>`, `<Camera>`, `<PointAnnotation>` |
| Payment UI | `@stripe/react-stripe-js` `<PaymentElement>` | `@stripe/stripe-react-native` `<CardField>` + `PaymentSheet` |
| Stripe Connect onboarding | Web redirect to Stripe URL | Open in `expo-web-browser` with deep link return |
| Video recording | Web `MediaRecorder` API | `expo-camera` |
| Geolocation | `navigator.geolocation` | `expo-location` (supports background tracking) |
| Push notifications | Web Push API | `expo-notifications` + APNs (iOS) + FCM (Android) |
| Analytics | PostHog JS SDK | `posthog-react-native` |
| Local storage | `localStorage` | `AsyncStorage` |
| Image component | `next/image` | React Native `<Image>` or `expo-image` |
| Links/navigation | `next/link` + `useRouter()` | Expo Router `<Link>` + `useRouter()` |

## API Client Pattern

Create a shared API client that handles auth token injection:

```typescript
// mobile/lib/api.ts
import { useAuth } from '@clerk/clerk-expo';

const API_BASE = 'https://atl.hmucashride.com/api';

export async function apiClient(
  path: string,
  options: RequestInit = {},
  token: string | null
) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}
```

## Screen Structure (Expo Router)

```
mobile/app/
├── _layout.tsx              ← Root layout (ClerkProvider, StripeProvider, PostHogProvider)
├── index.tsx                ← Landing / auth gate
├── (auth)/
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   └── pending.tsx
├── (rider)/
│   ├── _layout.tsx          ← Tab navigator (Home, Browse, Profile, Settings)
│   ├── home.tsx
│   ├── browse.tsx
│   ├── profile.tsx
│   ├── settings.tsx
│   └── support.tsx
├── (driver)/
│   ├── _layout.tsx          ← Tab navigator (Home, Feed, Dashboard, Profile, Settings)
│   ├── home.tsx
│   ├── feed.tsx
│   ├── go-live.tsx
│   ├── dashboard.tsx
│   ├── profile.tsx
│   ├── settings.tsx
│   ├── payout-setup.tsx
│   ├── rides.tsx
│   ├── schedule.tsx
│   └── support.tsx
├── ride/
│   └── [id].tsx             ← Active ride screen (map, GPS, chat, status controls)
├── d/
│   └── [handle].tsx         ← Driver public profile (deep link)
└── (legal)/
    ├── privacy.tsx
    └── terms.tsx
```

## Build Phases

### Phase 1: Project Setup + Auth
1. `npx create-expo-app mobile --template blank-typescript`
2. Install all dependencies (see tech stack)
3. Configure `app.json` / `app.config.ts` (bundle ID, scheme `hmuatl://`, etc.)
4. Set up Clerk with `@clerk/clerk-expo` (publishable key from env)
5. Build sign-in, sign-up, auth-callback, pending screens
6. Create API client with token injection
7. Test: user can sign in and hit `/api/users/me`

### Phase 2: Home Screens + Feed
1. Rider home screen (active ride check on mount via `/api/rides/active`)
2. Driver home screen (earnings summary via `/api/driver/earnings`)
3. Rider browse feed (driver availability via `/api/feed/riders`)
4. Driver feed (incoming requests via `/api/drivers/requests`)
5. HMU post creation (rider: `/api/rider/posts`, driver: `/api/driver/posts`)
6. Ably integration for live feed updates

### Phase 3: Booking Flow
1. Driver accepts/expresses interest (`/api/bookings/[postId]/accept`)
2. Rider selects driver (`/api/bookings/[postId]/select`)
3. Price negotiation UI
4. Payment method selection (list from `/api/rider/payment-methods`)
5. Add payment method (Stripe `PaymentSheet` + `/api/rider/payment-methods/setup-intent`)

### Phase 4: Active Ride (Most Complex Screen)
1. Map rendering with `@rnmapbox/maps`
2. Real-time driver location via Ably subscription
3. GPS tracking with `expo-location` (background mode for drivers)
4. Ride state transitions (OTW → HERE → Start → Confirm → Active → End)
5. In-ride chat via Ably
6. Stop management (add stop, stop reached)
7. ETA display using shared `lib/geo/distance.ts`

### Phase 5: Post-Ride + Payments
1. Rating screen (CHILL, Cool AF, Kinda Creepy, WEIRDO)
2. Driver earnings display
3. Driver cashout flow
4. Driver payout setup (Stripe Connect via `expo-web-browser`)
5. Rider payment method management

### Phase 6: Profile + Settings
1. Driver profile (display name, areas, pricing, vehicle photo, video intro)
2. Rider profile (display name, preferences)
3. Settings screens (notification prefs, payment methods, support)
4. Video upload via `expo-camera` + `/api/upload/video`

### Phase 7: Push Notifications
1. Configure `expo-notifications` with APNs + FCM
2. Register device token with server (may need new endpoint)
3. Handle notification types: ride accepted, driver OTW, driver HERE, ride ended, dispute window

### Phase 8: Market Detection + Multi-City
1. Build `GET /api/markets/detect` endpoint (query markets table by GPS proximity)
2. On app launch: detect GPS → resolve market → show appropriate screen
3. Live market: confirm and proceed
4. Planned market: waitlist capture form (store in DB for launch planning)
5. No market: "Tell us where to launch" request form
6. Market-aware Mapbox bbox for address search
7. Store active market in AsyncStorage, re-detect on significant GPS change (>50 miles)

### Phase 9: Polish + Submission
1. Deep linking (`hmuatl://` scheme for ride links, driver profiles, auth returns)
2. App icon, splash screen
3. Error boundaries with Sentry
4. Offline state handling
5. App Store Connect + Google Play Console submission

## Design Guidelines

- **Dark theme**: Match web app (dark backgrounds `#080808`, `#18181b`, `#27272a`)
- **Accent colors**: Vibrant greens (`#00E676`), oranges, consistent with web
- **Typography**: Bold, urban Atlanta aesthetic
- **Language**: HMU, BET, OTW, CHILL, Cool AF, WEIRDO — same vocabulary as web
- **Reference the web components** for design intent — they use inline styles so colors/spacing are explicit
- **Mobile-native patterns**: Use bottom sheets (not modals), swipe gestures, haptic feedback
- **No web patterns**: No hover states, no tooltips, no horizontal scroll tables

## Environment Variables

Create `mobile/.env`:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=       # Same key as web
EXPO_PUBLIC_API_BASE=https://atl.hmucashride.com/api
EXPO_PUBLIC_MAPBOX_TOKEN=                # Same token as web
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=      # Same key as web
EXPO_PUBLIC_ABLY_KEY=                    # Client-safe key (NOT the full API key)
EXPO_PUBLIC_POSTHOG_KEY=                 # Same key as web
EXPO_PUBLIC_POSTHOG_HOST=https://app.posthog.com
EXPO_PUBLIC_SENTRY_DSN=                  # Same DSN or new mobile project
```

## Market Expansion (Multi-City Support)

The web app is currently hardcoded to Atlanta. The native app must be **market-agnostic from day one**.

### How It Works

On app launch, detect the user's GPS location and call `GET /api/markets/detect?lat=X&lng=Y` (this endpoint needs to be built — see below). The response determines what the user sees:

| GPS Result | Screen |
|---|---|
| Inside a **live** market | Normal app — confirm market, proceed to home |
| Inside a **planned** market | "We're coming to [City] soon. Want to be first?" → waitlist form (name, phone, areas) |
| **No market** nearby | "We're not in your city yet. Tell us where to launch next." → city request form |

### Market Detection Endpoint (Build This)

The web app has a `markets` table (`lib/db/migrations/admin-portal.sql`) with `geo_center_lat`, `geo_center_lng`, `geo_radius_miles`, and `is_active`. Build this route:

```
GET /api/markets/detect?lat=33.749&lng=-84.388

Response:
{
  market: {
    slug: 'atl',
    name: 'Atlanta',
    status: 'live',         // 'live' | 'planned' | null
    areas: ['Downtown', 'Midtown', 'Eastside', ...],
    bbox: '-84.8,33.5,-84.1,34.1',
    timezone: 'America/New_York'
  },
  distance: 0.3             // miles from market center
}

// If no market found:
{ market: null, nearest: { slug: 'mem', name: 'Memphis', distance: 245.7 } }
```

### Address Search Must Be Market-Aware

The web app hardcodes `ATLANTA_BBOX` in `lib/mapbox/search.ts`. The native app must pass the active market's bounding box to Mapbox address search. Calculate bbox from the market's `geo_center_lat/lng` + `geo_radius_miles`.

### Ably Channels Are Already Dynamic

The Ably token endpoint (`/api/ably/token`) already grants `area:*:feed` wildcard — users can subscribe to any market's area feed. Driver posts already publish to `area:{slug}:feed` per area. No changes needed for realtime.

### Driver Flow on Market Change

```
Driver opens app in Houston
  → GPS detected → /api/markets/detect → Houston (live)
  → "You're in Houston. Driving here today?" → Confirm
  → Driver goes live → posts publish to area:houston:feed channels
  → App stores active market in AsyncStorage
  → Next open: check if GPS moved >50 miles → re-detect market
```

---

## In-App Purchase Strategy

### What Apple/Google Require

Apple and Google require their IAP system for **digital goods** sold in-app. But **real-world services** (rides) are **exempt**.

| Revenue Type | IAP Required? | How to Handle |
|---|---|---|
| Ride payments | **No** — real-world physical service, exempt | Keep using Stripe directly |
| HMU First subscription ($9.99/mo) | **Yes if sold in-app** | Sell via web only at launch (see below) |
| Cash packs | Evaluate per guidelines | Likely IAP-required if digital consumable |

### Launch Strategy: No IAP

**Do NOT implement in-app purchases for launch.** Instead:

1. **Ride payments**: Stripe `PaymentSheet` (allowed — real-world service exemption, Apple Guidelines Section 3.1.3(e))
2. **HMU First subscription**: Show upgrade CTA → opens `atl.hmucashride.com/driver/upgrade` via `expo-web-browser` → Stripe handles payment on web → subscription status syncs back via `GET /api/users/profile` (returns `tier: 'free' | 'hmu_first'`)
3. **No IAP library needed** — no `expo-iap` or `react-native-iap` dependency

### What the App Shows

- **Not subscribed driver**: Badge on dashboard — "Go HMU First: instant payouts, lower fees" → button opens web upgrade page
- **Subscribed driver**: HMU First badge displayed, instant payout enabled, lower fee tier in earnings breakdown
- **Riders**: No subscription. OG status is earned (10 rides + 0 disputes), not purchased

### Future IAP (Post-Launch)

If conversion data shows drivers won't leave the app to subscribe, add IAP later:
- Use `react-native-iap` library
- Price in-app at $12.99 (covers Apple's 15-30% cut), keep web at $9.99
- Server validates receipts via Apple/Google APIs before granting tier upgrade
- This is a separate effort — do not build IAP infrastructure at launch

---

## Important Rules

1. **Do NOT modify any existing web app code** — the Next.js app stays untouched
2. **Do NOT create a new API** — use the existing endpoints at `atl.hmucashride.com` (exception: you may need to build `GET /api/markets/detect`)
3. **Copy shared business logic** — don't rewrite `distance.ts`, `state-machine.ts`, etc.
4. **Use the exact UI vocabulary** from CLAUDE.md (HMU, BET, OTW, COO, CHILL, etc.)
5. **Test on both platforms** — iOS Simulator + Android Emulator
6. **Handle background states** — ride tracking must work when app is backgrounded
7. **Deep link support** — `hmuatl://ride/{id}`, `hmuatl://d/{handle}`, `hmuatl://auth-callback`
8. **Market-agnostic from day one** — never hardcode "Atlanta" or ATL-specific bounding boxes
9. **No IAP at launch** — HMU First subscription via web only, ride payments via Stripe
10. **One app** — riders and drivers in the same app, gated by `profileType`
