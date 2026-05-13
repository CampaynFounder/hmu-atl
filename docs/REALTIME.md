# REALTIME ARCHITECTURE — Ably Channels & GPS Tracking

> **Part of HMU ATL documentation suite.** See [CLAUDE.md](../CLAUDE.md) for core project context.

---

## ABLY CHANNEL ARCHITECTURE (DO NOT DEVIATE)

```
ride:{ride_id}            → GPS, status updates during active ride
user:{user_id}:notify     → Personal push notifications
area:{area_slug}:feed     → Driver Presence per area (rider feed subscribes here)
admin:feed                → All system events → Admin dashboard
```

### Mandatory Rules

1. **NEVER expose ABLY_API_KEY to client** — issue scoped JWT from Cloudflare Worker only
2. **Validate Clerk session BEFORE issuing any Ably token**
3. **Token scoped to only channels the user is allowed to access**
4. **Publish GPS every 10 seconds OR 50 meter movement** — whichever is less frequent
5. **If no GPS update in 90 seconds** → show "Driver connection lost" + alert admin
6. **Use Ably Presence API for driver availability feed** — never poll database
7. **Enable message persistence (72hr) on all ride:{ride_id} channels**
8. **Every Ably event MUST simultaneously write to Neon.** Ably = realtime. Neon = truth.

---

## GPS TRACKING REQUIREMENTS

### Publishing Cadence
- **Active rides**: Publish every 10 seconds OR on 50m movement (whichever happens first)
- **Battery optimization**: Use `navigator.geolocation.watchPosition` with `maximumAge: 10000`
- **Precision**: High accuracy required during active rides (`enableHighAccuracy: true`)

### Connection Health
- **90-second timeout**: If no GPS update received, flag as "Driver connection lost"
- **Admin alert**: Push to `admin:feed` channel for monitoring
- **Rider UX**: Show connection status indicator on active ride screen

### Data Stored
Each GPS ping writes to:
1. **Ably channel** `ride:{ride_id}` — realtime position updates
2. **Neon table** `ride_locations` — permanent audit trail

```sql
CREATE TABLE ride_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id) ON DELETE CASCADE,
  lat NUMERIC(10,8) NOT NULL,
  lng NUMERIC(11,8) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ride_locations_ride_id ON ride_locations(ride_id);
CREATE INDEX idx_ride_locations_recorded_at ON ride_locations(recorded_at);
```

---

## ABLY TOKEN ISSUANCE

### Endpoint
`POST /api/tools/ably/token`

### Request Flow
1. Validate Clerk session (reject if missing/invalid)
2. Read user's `profile_type` from Neon
3. Generate scoped token based on role:
   - **Rider**: `user:{userId}:notify`, `ride:{rideId}` (for active rides only)
   - **Driver**: `user:{userId}:notify`, `ride:{rideId}`, `area:{area_slug}:feed` (for posted areas)
   - **Admin**: All channels (`*`)

### Token TTL
- **Standard**: 1 hour (refresh before expiry)
- **Active ride**: 4 hours (covers long rides without re-auth)

### Security
- **Never** issue wildcard tokens to non-admin users
- **Always** validate ride ownership before granting `ride:{rideId}` access
- **Reject** token requests for rides the user is not part of

---

## DRIVER PRESENCE (Area Feed)

### How It Works
1. Driver taps "HMU" → posts to feed → joins Ably Presence on `area:{area_slug}:feed`
2. Riders browsing that area subscribe to the same channel
3. Rider's UI auto-updates when drivers enter/leave Presence
4. **Never poll database** for driver availability — Presence is the source of truth

### Presence Data
```typescript
{
  userId: string;
  displayName: string;
  profilePhotoUrl: string;
  areas: string[];
  minRideAmount: number;
  chillScore: number;
  tier: 'free' | 'hmu_first';
}
```

### Offline Detection
- Ably auto-removes user from Presence after 120s of no heartbeat
- Client-side: show "Offline" badge if driver hasn't published GPS in 90s

---

## EVENT SCHEMA

### Ride Status Updates
```typescript
{
  type: 'ride.status',
  rideId: string;
  status: 'matched' | 'otw' | 'here' | 'active' | 'ended';
  timestamp: string; // ISO 8601
  actorId: string; // who triggered the state change
}
```

### GPS Position
```typescript
{
  type: 'ride.gps',
  rideId: string;
  lat: number;
  lng: number;
  heading?: number; // degrees
  speed?: number; // m/s
  timestamp: string;
}
```

### Notifications (User Channel)
```typescript
{
  type: 'notification',
  notificationId: string;
  title: string;
  body: string;
  action?: { type: 'navigate', route: string };
  timestamp: string;
}
```

---

## ADMIN FEED

All system events publish to `admin:feed` for monitoring:
- Ride state changes
- Payment captures/failures
- Disputes filed
- Connection health alerts
- Fraud flags

Admin dashboard subscribes to this channel for real-time monitoring.

---

## ENVIRONMENT VARIABLES

```bash
ABLY_API_KEY=           # server-side ONLY — NEVER expose to client
NEXT_PUBLIC_ABLY_CLIENT_ID=
```

---

## RELATED DOCS
- [Ride Flow State Machine](./RIDE-FLOW.md) — When GPS tracking starts/stops
- [Schema](./SCHEMA.md) — `ride_locations` table structure
- [Payments](./PAYMENTS.md) — Ably events for payment status updates
