# HMU Partner API — Integration Guide

For third-party services that book HMU drivers programmatically (e.g. a delivery
or ordering platform that needs a driver dispatched and paid).

- **Base URL (prod):** `https://atl.hmucashride.com`
- **Base URL (staging):** `https://staging.hmucashride.com`
- **All paths are versioned under** `/api/partner/v1`
- **Content type:** `application/json`

> **Status legend:** ✅ Available now · 🚧 Planned (contract may change)

---

## 1. How billing works (read this first)

When you book an HMU driver, **two separate charges** happen:

1. **Your order charges** (the goods/items the customer bought) are handled on
   **your own Stripe account** — they never touch HMU.
2. **The delivery fee** is charged by **HMU**. HMU pays it out to the driver's
   connected account and keeps a configurable commission. You supply the
   delivery fee amount; HMU computes the split.

You will see two line items on the customer's statement (your order + HMU
delivery). HMU is the merchant of record for the delivery fee only.

The commission split (percent / flat / none, tips) is configured by HMU per
partner and per market. Every quote and booking response echoes the exact split
so you can display it.

---

## 2. Authentication

Every request needs **two headers**:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <your_api_key>` (e.g. `hmu_live_…` / `hmu_test_…`) |
| `X-HMU-Signature` | `t=<unix_seconds>,v1=<hmac>` |

The signature proves the request body wasn't tampered with and isn't a replay.

### Computing `X-HMU-Signature`

1. Take the current Unix time in **seconds** → `t`.
2. Build the signed payload string: `` `${t}.${rawBody}` `` where `rawBody` is
   the **exact** JSON string you send as the body. **For GET requests the body
   is the empty string**, so you sign `` `${t}.` `` (note the trailing dot).
3. Compute `HMAC-SHA256(signing_secret, payload)` and hex-encode it → `v1`.
4. Send the header `X-HMU-Signature: t=<t>,v1=<v1>`.

Requests are rejected if `t` is more than **5 minutes** from HMU server time, so
keep your clock roughly in sync.

> You receive **two** credentials from HMU: the **API key** (goes in
> `Authorization`) and the **signing secret** (used only to compute the HMAC,
> never sent over the wire). Keep both server-side.

### Node.js example

```js
import crypto from 'node:crypto';

const API_KEY = process.env.HMU_API_KEY;          // hmu_live_…
const SIGNING_SECRET = process.env.HMU_SIGNING_SECRET;
const BASE = 'https://atl.hmucashride.com';

async function hmuFetch(method, path, body) {
  const rawBody = body ? JSON.stringify(body) : '';   // '' for GET
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`${t}.${rawBody}`)
    .digest('hex');

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'X-HMU-Signature': `t=${t},v1=${v1}`,
      ...(rawBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: rawBody || undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.error}: ${data.message ?? ''}`);
  return data;
}

// list drivers near a point
await hmuFetch('GET', '/api/partner/v1/drivers?lat=33.78&lng=-84.38&limit=10');

// price a trip
await hmuFetch('POST', '/api/partner/v1/quotes', {
  pickup:  { lat: 33.78, lng: -84.38 },
  dropoff: { lat: 33.84, lng: -84.37 },
});
```

### Scopes

Your API key is granted a subset of scopes. A call with an insufficient scope
returns `403`.

| Scope | Grants |
|---|---|
| `drivers:read` | list + fetch drivers |
| `quotes:read` | price trips |
| `bookings:write` | create/cancel direct bookings 🚧 |
| `blasts:write` | create blasts 🚧 |

---

## 3. Errors

All errors return JSON: `{ "error": "<code>", "message": "<human readable>" }`.

| HTTP | `error` | Meaning |
|---|---|---|
| 400 | `bad_request` | Malformed body / invalid coordinates |
| 401 | `unauthorized` | Missing/invalid API key, or missing/stale/invalid signature |
| 403 | `forbidden` | Partner suspended, or key lacks the required scope |
| 404 | `not_found` | Driver (or resource) not found |
| 429 | `rate_limited` | Too many requests — see the `Retry-After` header (seconds) |
| 503 | `unavailable` | Transient backend hiccup — retry with backoff |

Rate limits are per-partner (default 60 req/min); ask HMU to raise yours if
needed.

---

## 4. Endpoints

### ✅ `GET /api/partner/v1/drivers`

List bookable drivers, same ranking/eligibility the HMU rider app uses.

**Query params** (all optional):

| Param | Type | Default | Notes |
|---|---|---|---|
| `offset` | int | 0 | pagination |
| `limit` | int | 12 | max 30 |
| `lat`, `lng` | float | — | rider/pickup coords; enables `distanceMi` + distance sorting |
| `gender` | `female`\|`male` | — | hard filter |
| `area` | string | — | area slug (e.g. `midtown`) |
| `maxPrice` | number | — | only drivers whose minimum price ≤ this |

**Response** `200`:

```jsonc
{
  "drivers": [
    {
      "handle": "alex_atl",
      "displayName": "Alex",
      "areas": ["midtown", "buckhead"],
      "minPrice": 8,
      "photoUrl": "https://…",
      "videoUrl": null,
      "chillScore": 92,
      "isHmuFirst": true,
      "acceptsCash": true,
      "cashOnly": false,
      "payoutReady": true,            // driver can receive payouts
      "acceptanceRate": 87,           // 0–100, or null if < 3 resolved offers
      "distanceMi": 2.3,              // null if no coords supplied
      "vehicleSummary": { "label": "2021 Toyota Camry", "maxRiders": 4 }
      // … plus: lgbtqFriendly, fwu, serviceIcons[], liveMessage, livePrice,
      //         hasVibeVideo, acceptsDownBad, verificationStatus, locationSource
    }
  ],
  "hasMore": true                     // true if a full page came back
}
```

> Listing shows all visible active drivers. Whether a given driver can actually
> be **booked** through the API is governed by their consent flag — see
> `acceptPartnerBookings` on the single-driver endpoint, and the booking
> endpoint's errors.

---

### ✅ `GET /api/partner/v1/drivers/{handle}`

Fetch one driver by handle.

**Response** `200`:

```jsonc
{
  "driver": {
    "handle": "alex_atl",
    "displayName": "Alex",
    "areas": ["midtown", "buckhead"],
    "pricing": { "base": 3.5, "per_mile": 1.0, "per_minute": 0.35, "minimum": 8 },
    "schedule": { /* availability windows */ },
    "vehiclePhotoUrl": "https://…",
    "isHmuFirst": true,
    "chillScore": 92,
    "completedRides": 240,
    "acceptDirectBookings": true,
    "acceptPartnerBookings": false,   // must be true to book via this API
    "minRiderChillScore": 0,
    "requireOgStatus": false
  }
}
```

`404 not_found` if the handle doesn't exist or the driver isn't active.

---

### ✅ `POST /api/partner/v1/quotes`

Price a trip (distance, suggested fare, deposit). No booking is created.

**Body:**

```jsonc
{
  "pickup":  { "lat": 33.78, "lng": -84.38 },
  "dropoff": { "lat": 33.84, "lng": -84.37 },
  "stops":   [ { "lat": 33.80, "lng": -84.39 } ],   // optional
  "market_slug": "atl"                               // optional; scopes pricing
}
```

**Response** `200`:

```jsonc
{
  "distance_mi": 4.1,
  "estimated_minutes": 14,
  "suggested_price_dollars": 12,
  "suggested_price_cents": 1200,
  "deposit_cents": 600,
  "deposit_dollars": 6,
  "breakdown": { /* fare component breakdown */ },
  "market_slug": "atl"
}
```

`400 bad_request` if `pickup`/`dropoff` are missing or out of range.

---

### 🚧 `POST /api/partner/v1/bookings` — *planned, not yet live*

Books a specific driver for a delivery and (on driver accept) holds the delivery
fee against your funding source, paying out to the driver's connected account.

> **This contract is not final and the endpoint is not deployed yet.** It is
> published here so you can design your integration. We'll confirm the final
> shape before go-live.

**Planned body:**

```jsonc
{
  "driver_handle": "alex_atl",
  "external_rider": {                 // your customer (not an HMU user)
    "ref": "your-customer-id-123",
    "name": "Jordan",
    "phone": "+14045551212"
  },
  "pickup":  { "lat": 33.78, "lng": -84.38, "address": "Store, Midtown" },
  "dropoff": { "lat": 33.84, "lng": -84.37, "address": "123 Main St" },
  "delivery_fee_cents": 800,          // the fee HMU charges + splits
  "market_slug": "atl",
  "scheduled_for": null               // ISO time, or null = ASAP
}
```

Send an `Idempotency-Key: <uuid>` header so retries don't double-book.

**Planned response** `201`:

```jsonc
{
  "booking_id": "…",
  "status": "pending_accept",         // → accepted → in_progress → completed
  "expires_at": "2026-06-13T20:15:00Z",
  "fee_split": {
    "delivery_fee_cents": 800,
    "platform_fee_cents": 120,        // HMU commission
    "driver_payout_cents": 680
  }
}
```

Booking-time errors you should handle: `403 driver_not_bookable` (driver hasn't
opted into partner bookings), `409 driver_unavailable`, `402` (funding issue).

---

### 🚧 Status updates — webhooks + polling — *planned*

You won't poll the driver's live state. HMU will **POST signed events** to a
`webhook_url` you register (booking matched, driver en route, started, completed,
cancelled), with `GET /api/partner/v1/bookings/{id}` as a polling fallback.
Webhook signing mirrors the inbound `X-HMU-Signature` scheme.

---

## 5. Sandbox / testing

- **Test keys** (`hmu_test_…`) run against the **staging** environment and
  Stripe test mode — no real money moves.
- Use staging (`https://staging.hmucashride.com`) to integrate, then swap to
  live keys + the prod base URL.

---

## 6. Getting credentials

HMU provisions your partner account with: an **API key**, a **signing secret**,
your allowed **markets**, **scopes**, and (for bookings) your **commission
policy** and **funding method**. Contact HMU to get set up.
