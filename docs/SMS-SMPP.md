# SMS Infrastructure & SMPP Analysis

> Reference for understanding the current VoIP.ms HTTP API setup and what migrating to SMPP would unlock.
> Written 2026-05-21. Revisit when blast fanout regularly hits 30+ drivers or conversation agent needs <50ms DLRs.

---

## Current Architecture: VoIP.ms HTTP REST API

Every outbound SMS is a stateless HTTP GET to `https://voip.ms/api/v1/rest.php?method=sendSMS&...`.
Inbound SMS arrives via webhook callbacks to `/api/webhooks/voipms` (GET or POST).

### Key files

| Purpose | File |
|---|---|
| Core send function | `lib/sms/textbee.ts` |
| Inbound webhook | `app/api/webhooks/voipms/route.ts` |
| Blast delivery receipt webhook | `app/api/blast/voipms/webhook/route.ts` |
| SMS templates (DB-backed) | `lib/sms/templates.ts` |
| Multi-part chunking | `lib/sms/chunk.ts` |
| Dedup logic | `lib/sms/dedup.ts` |
| Blast fanout + gating | `lib/blast/notify.ts` |
| Conversation inbound routing | `lib/conversation/inbound.ts` |

### Environment variables

```
VOIPMS_API_USERNAME         — VoIP.ms login email
VOIPMS_API_PASSWORD         — VoIP.ms API password (not login password)
VOIPMS_DID_ATL              — 10-digit SMS-enabled DID for Atlanta
VOIPMS_DID_NOLA             — New Orleans (falls back to ATL if unset)
VOIPMS_DID_HOU              — Houston
VOIPMS_DID_DAL              — Dallas
VOIPMS_DID_MEM              — Memphis
VOIPMS_WEBHOOK_ALLOWLIST    — Comma-separated source IPs (open in dev)
VOIPMS_WEBHOOK_SECRET       — Query param secret for webhook auth (optional)
```

### Active SMS flows

| Flow | Trigger | Event type | File |
|---|---|---|---|
| New booking request → driver | Rider books | `new_booking` | `lib/sms/textbee.ts` |
| Booking accepted/declined → rider | Driver responds | `booking_accepted` / `booking_declined` | `lib/sms/textbee.ts` |
| Driver OTW → rider | Driver marks OTW | `driver_otw` | `app/api/rides/[id]/otw/route.ts` |
| Driver here → rider | Driver marks here | `driver_here` | `app/api/rides/[id]/here/route.ts` |
| ETA nudge → driver | Rider taps nudge on stale ETA | `eta_nudge` | `app/api/rides/[id]/eta-nudge/route.ts` |
| Blast notification → drivers | Rider creates blast | `blast_notification` | `lib/blast/notify.ts` |
| Activation nudge | Admin-triggered | `driver_payout_setup` etc. | `app/api/admin/users/[id]/send-activation-nudge/route.ts` |
| Marketing campaign | Admin-triggered | `marketing` | `app/api/admin/marketing/send/route.ts` |
| Welcome + safety | Onboarding complete | `welcome_driver` / `welcome_rider` | `app/api/users/onboarding/route.ts` |
| Conversation reply | Conversation agent | custom | `lib/conversation/` |
| Quick mid-ride messages | Rider/driver tap | `quick_*` | `app/api/rides/[id]/messages/route.ts` |

### Constraints enforced today

- **155-char hard cap** — VoIP.ms rejects >160; 5-char buffer for GSM-7 encoding overhead (smart quotes, accented chars count as 2 bytes)
- **1 retry max, 1500ms delay** — network errors only; fatal errors (invalid credentials, missing DID) do not retry
- **Blast ceiling** — `blast.max_sms_per_blast` runtime config (default 10); `blast.sms_kill_switch` global off-switch
- **72h dedup window** — per `(user_id, event_type)` pair; prevents spam during activation flows
- **7-layer blast gating** — opt-in flag → SMS enabled → quiet hours → min fare → daily cap → kill switch → per-blast ceiling

### Logging & audit tables

| Table | Purpose |
|---|---|
| `sms_log` | Every outbound send: status, VoIP.ms response JSON, retry count, ride/user/market |
| `sms_inbound` | Every inbound SMS: from, DID, message, VoIP.ms message ID |
| `admin_sms_sent` | Admin-triggered sends: admin ID, recipient, message, status |
| `voip_webhook_log` | Every webhook hit: raw params, parse outcome, forensic debugging |

---

## SMPP: What It Is and What It Unlocks

SMPP (Short Message Peer-to-Peer) is a **persistent TCP protocol** — one long-lived socket to VoIP.ms's SMPP server, messages flow through it with no per-message HTTP overhead. It's the protocol mobile carriers use natively.

### HTTP API vs SMPP comparison

| Capability | HTTP API (current) | SMPP |
|---|---|---|
| Throughput | ~2–5 msg/sec (HTTP overhead) | 50–500+ msg/sec (windowed) |
| Latency per message | ~200–400ms (new TCP+TLS per request) | ~5–20ms after connection established |
| Delivery receipts (DLRs) | Best-effort webhook, can miss | Synchronous on same socket, authoritative |
| Long message handling | Manual `chunk.ts` at 150 chars | Native UDH at protocol level, up to 64KB |
| Two-way messaging | Separate inbound webhook endpoint | MO + MT on same session |
| Unicode handling | Implicit, can silently truncate | Explicit `data_coding` field — no surprises |
| Connection model | Stateless (good for Workers) | Stateful persistent socket (bad for Workers) |

### Capabilities SMPP would unlock

1. **Authoritative delivery receipts** — DLRs arrive on the same socket synchronously. No webhook timing issues, no missed callbacks. This would fix the fragile JSONB scan in `app/api/blast/voipms/webhook/route.ts`.

2. **Blast throughput at scale** — SMPP windowing lets you have N messages in-flight simultaneously. Sending 100 driver notifications takes seconds, not minutes.

3. **Remove the 155-char hack** — SMPP handles long messages natively via UDH (User Data Header) or the `message_payload` TLV. `lib/sms/chunk.ts` could be deleted.

4. **Explicit Unicode control** — `data_coding` field specifies GSM-7 (0x00) or UCS-2 (0x08). No silent truncation or encoding surprises.

5. **Conversation agent quality** — Bidirectional on one session, <20ms latency, authoritative DLRs. Better than fire-and-forget HTTP for a two-way agent.

---

## The Hard Constraint: Cloudflare Workers

**Workers cannot maintain persistent TCP connections across requests.** Each invocation is short-lived. SMPP requires a socket that stays open for hours with heartbeat `enquire_link` PDUs.

To use SMPP you need a **sidecar process** outside Workers:

```
Worker → HTTP → SMPP Sidecar (Node/Bun on Fly.io) → TCP → VoIP.ms SMPP server
                      ↓
              DLR callbacks → blast webhook logic
```

The sidecar would:
1. Maintain the SMPP session and reconnect on drop
2. Expose an internal HTTP endpoint (`POST /send`) for Workers to call
3. Forward delivery receipts to your existing blast DLR endpoint

This is a real piece of infrastructure — roughly a 1–2 day build to do correctly (connection pooling, reconnect logic, windowing, DLR correlation).

---

## Decision Framework: When to Migrate

| Trigger | Current state | Threshold |
|---|---|---|
| Blast fanout per event | Capped at 10 | Migrate when regularly hitting 30+ |
| Daily SMS volume | Low-medium | Migrate when >1,000/day |
| DLR reliability is business-critical | TODO comments in blast webhook | Migrate when conversation agent scoring needs it |
| Conversation agent latency | Async, fire-and-forget | Migrate when <50ms DLR confirmation needed |

**Do not migrate for throughput alone** until the blast ceiling is raised and you're regularly hitting it.

---

## Near-Term Improvements (Without SMPP)

These fix real gaps without adding infrastructure:

### 1. Fix delivery receipt linkage (highest priority)

The blast DLR webhook (`app/api/blast/voipms/webhook/route.ts`) currently scans `sms_log.voipms_response` JSONB to reverse-lookup `blast_id` and `driver_id`. This is fragile.

**Fix**: At blast send time, store `voipms_message_id` directly on `blast_driver_events`:
```sql
ALTER TABLE blast_driver_events ADD COLUMN voipms_message_id TEXT;
```
Then the DLR webhook becomes a direct index lookup instead of a JSONB scan.

### 2. Add per-second rate limiting to blast fanout

`lib/blast/notify.ts` uses a flat 500ms inter-recipient sleep. At 10 recipients that's 5s of serial waiting.

**Fix**: Batch into groups of 5, fire concurrently within a batch, 300ms between batches. Stays well under VoIP.ms's rate limits and cuts fanout time by ~60%.

### 3. Harden webhook security

Both webhook endpoints have `// TODO: Upstash rate-limit per IP` comments. Add it — a misconfigured VoIP.ms retry policy could flood the endpoints.

### 4. Twilio as SMPP abstraction (alternative path)

If DLR reliability becomes critical before sidecar infrastructure is ready, Twilio Programmable Messaging handles SMPP internally and exposes it via HTTP. You're already paying for Twilio (Verify via Clerk). Tradeoff: cost (~$0.0075/SMS outbound vs VoIP.ms ~$0.009 — Twilio is actually cheaper at scale) and you'd lose the per-market DID control.

---

## SMPP Implementation Sketch (for when you're ready)

### Sidecar service (Node/Bun, ~200 lines)

```ts
// smpp-sidecar/index.ts
import smpp from 'smpp'; // npm install smpp

const session = smpp.connect({
  host: 'smpp.voip.ms',
  port: 2775,
  system_id: process.env.VOIPMS_SMPP_SYSTEM_ID,
  password: process.env.VOIPMS_SMPP_PASSWORD,
  system_type: 'SMPP',
});

session.on('deliver_sm', (pdu) => {
  // Delivery receipt — forward to your DLR endpoint
  const receipt = parseDeliveryReceipt(pdu.short_message);
  await fetch(process.env.DLR_CALLBACK_URL, {
    method: 'POST',
    body: JSON.stringify({ message_id: receipt.id, status: receipt.stat }),
  });
  session.send(pdu.response());
});

// HTTP API for Workers to call
Bun.serve({
  port: 3001,
  async fetch(req) {
    const { to, from, message } = await req.json();
    return new Promise((resolve) => {
      session.submit_sm({
        destination_addr: to,
        source_addr: from,
        short_message: message,
        registered_delivery: 1, // request DLR
      }, (pdu) => {
        resolve(Response.json({ message_id: pdu.message_id }));
      });
    });
  },
});
```

### VoIP.ms SMPP credentials

VoIP.ms issues separate SMPP credentials (distinct from API username/password). Request via their portal under **DID Numbers → Manage DIDs → SMS → SMPP Settings**.

New env vars needed:
```
VOIPMS_SMPP_HOST            — smpp.voip.ms (or their regional endpoint)
VOIPMS_SMPP_PORT            — 2775 (standard) or 8775 (TLS)
VOIPMS_SMPP_SYSTEM_ID       — issued by VoIP.ms
VOIPMS_SMPP_PASSWORD        — issued by VoIP.ms
SMPP_SIDECAR_URL            — internal URL of sidecar (e.g. https://smpp.internal.hmucashride.com)
```

### Worker-side change

In `lib/sms/textbee.ts`, swap the VoIP.ms HTTP call for a call to the sidecar:

```ts
// Replace the voip.ms API fetch with:
const res = await fetch(`${process.env.SMPP_SIDECAR_URL}/send`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ to: dst, from: did, message }),
});
const { message_id } = await res.json();
// store message_id in sms_log for DLR correlation
```

Everything else (logging, dedup, templates, chunking) stays the same or gets simplified.

---

*See also: [Realtime](./REALTIME.md) for Ably channel architecture that complements SMS flows.*
*See also: [Blast Booking Spec](./BLAST-BOOKING-SPEC.md) for blast fanout gating details.*
