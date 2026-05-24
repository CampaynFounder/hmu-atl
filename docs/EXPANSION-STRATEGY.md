# HMU Cash Ride — National Expansion Strategy
> Executive Proposal · v1.0 · May 2026
> Status: DRAFT — under review

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Current Architecture Assessment](#current-architecture-assessment)
3. [Multi-Market Architecture](#multi-market-architecture)
   - [The Market Entity](#1-the-market-entity)
   - [Geographic Abstraction Model](#2-geographic-abstraction-model)
   - [Domain & Routing Strategy](#3-domain--routing-strategy)
4. [Market Launch Automation](#market-launch-automation)
   - [The Market Lifecycle](#the-market-lifecycle)
   - [Launch Checklist Agent](#launch-checklist-agent)
   - [Supply Bootstrapping Automation](#supply-bootstrapping-automation)
5. [Admin by Exception Model](#admin-by-exception-model)
6. [Agentic Operations Framework](#agentic-operations-framework)
7. [Social & Community Automation](#social--community-automation)
8. [Performance Optimization for Scale](#performance-optimization-for-scale)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Key Risks and Mitigations](#key-risks-and-mitigations)
11. [What to Build First](#what-to-build-first)
12. [Open Questions](#open-questions)

---

## Executive Summary

HMU Cash Ride has proven product-market fit in Atlanta: the core ride flow works, drivers earn, riders save, and the brand voice resonates with the target demographic. The constraint on growth is not the product — it is the architecture. Every entity in the current system is implicitly scoped to a single market. Scaling nationally requires inverting this: every entity must be explicitly scoped to a market, markets must be declaratively launchable, and the operator burden per new market must approach zero.

This proposal defines the architecture, automation, and agentic infrastructure to support that vision.

> **OPEN FOR REVIEW:** Does this framing match your growth timeline? Are there near-term market targets we should name explicitly in this document?

---

## Current Architecture Assessment

### What is market-aware today
- Ably channels already use `area:{slug}:feed` — the slug pattern is extensible
- `lib/platform-config/get.ts` exists — per-market config is partially anticipated
- `wrangler.worker.jsonc` already routes `nola.hmucashride.com` to the same Worker
- Admin panel has a "Markets" route stub
- `areas TEXT[]` fields exist on drivers, riders, and posts

### What is implicitly ATL-only today
- Clerk publishable key is bound to `clerk.atl.hmucashride.com`
- Database has no `market_id` column on any table
- `areas` is a free-text array, not a normalized geographic reference
- Fee caps, geofence radii, and wait fee bands are global — no per-market override
- Notification templates reference ATL copy
- The Blast funnel (`/blast`) assumes ATL context
- FB group references in admin are single-market

### Technical Debt That Blocks Expansion
| Item | Impact | Effort |
|---|---|---|
| No `market_id` on core tables | Cannot query or isolate by market | Medium (additive migration) |
| `areas` free-text | No consistent neighborhood taxonomy | Medium |
| Clerk single-domain config | Auth breaks on new subdomains | Low (add allowed origins) |
| Ably channel names lack market prefix | Cross-market data leakage risk | Low |
| Blast funnel hardcoded to ATL | Cannot acquire drivers in new markets | Low |

---

## Multi-Market Architecture

### 1. The Market Entity

A `markets` table becomes the spine of the entire system. Every user, post, ride, and event anchors to a market.

```sql
CREATE TABLE markets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,          -- 'atl', 'nola', 'charlotte'
  name          TEXT NOT NULL,                 -- 'Atlanta', 'New Orleans'
  display_name  TEXT NOT NULL,                 -- 'HMU ATL', 'HMU NOLA'
  status        TEXT CHECK (status IN (
    'planned','soft_launch','active','paused','sunset'
  )) DEFAULT 'planned',
  timezone      TEXT NOT NULL,                 -- 'America/New_York'
  currency      TEXT DEFAULT 'usd',
  -- Geographic bounds (bounding box for fast market detection)
  bounds_sw_lat NUMERIC(10,8),
  bounds_sw_lng NUMERIC(11,8),
  bounds_ne_lat NUMERIC(10,8),
  bounds_ne_lng NUMERIC(11,8),
  -- Social channels
  fb_group_id   TEXT,
  fb_group_url  TEXT,
  ig_handle     TEXT,
  tiktok_handle TEXT,
  -- Launch thresholds
  launch_date              DATE,
  launch_driver_target     INTEGER DEFAULT 25,
  launch_rider_target      INTEGER DEFAULT 100,
  -- Per-market config overrides (NULL = inherit global platform_config default)
  fee_config     JSONB,    -- progressive tier rate/cap overrides
  geo_config     JSONB,    -- geofence radii overrides
  pricing_config JSONB,    -- wait fee band, min/max ride price
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE market_neighborhoods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id   UUID REFERENCES markets(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,               -- 'west-end', 'buckhead'
  name        TEXT NOT NULL,               -- 'West End', 'Buckhead'
  center_lat  NUMERIC(10,8),
  center_lng  NUMERIC(11,8),
  zip_codes   TEXT[],
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(market_id, slug)
);

CREATE TABLE market_zip_codes (
  zip_code    TEXT NOT NULL,
  market_id   UUID REFERENCES markets(id) ON DELETE CASCADE,
  PRIMARY KEY (zip_code, market_id)
);
```

**Every core table gets a `market_id` FK:**
- `hmu_posts` — always in one market at a time
- `rides` — anchored to market at creation
- `driver_profiles` and `rider_profiles` — home market; can opt into others
- `users` — many-to-many via `user_markets` junction table (a driver can operate in ATL + NOLA)

> **OPEN FOR REVIEW:** Should a user have one home market or be able to operate freely across all markets? This affects matching logic and notification routing.

### 2. Geographic Abstraction Model

Three resolution levels, used together:

| Level | Use Case | Storage |
|---|---|---|
| Lat/Lng | GPS tracking, geofence checks, proximity matching | `NUMERIC(10,8)` on rides + locations |
| Zip Code | Market detection on signup, post filtering, analytics segmentation | `market_zip_codes` table |
| Neighborhood | Human-readable areas in UI, driver area declarations, feed filtering | `market_neighborhoods` + slug references |

**Market detection flow:**
1. User opens `hmucashride.com` → Cloudflare Worker reads `CF-IPCountry` + `CF-IPCity` headers
2. Worker checks zip code against `market_zip_codes` (cached in Cloudflare KV)
3. If matched → redirect to `{slug}.hmucashride.com`
4. If no match → show "We're not in your city yet — join the waitlist"

**Zip code ingestion:** Each market launch includes a one-time import of USPS ZIP → neighborhood mappings for that metro. The app never presents raw ZIP codes in UI — always resolves to neighborhood name.

**Neighborhood data source options:**
- Manual entry in admin panel (full control, labor-intensive)
- Import from OpenStreetMap Nominatim (automated, coverage varies)
- Hybrid: import as seed, admin curates

> **OPEN FOR REVIEW:** Which neighborhood ingestion approach do you prefer? Manual gives brand control over which areas we name. OpenStreetMap is faster to launch but may include areas outside our service zone.

### 3. Domain & Routing Strategy

```
hmucashride.com              → Market detection → redirect or waitlist
atl.hmucashride.com          → ATL context (current production)
nola.hmucashride.com         → NOLA context (same codebase, NOLA market)
charlotte.hmucashride.com    → Charlotte context (etc.)
staging.hmucashride.com      → Staging worker (market=atl default, ?market= param override)
```

**Single Worker binary, all markets.** Market context injected via:
1. The `Host` header (subdomain → slug lookup in KV)
2. A `X-HMU-Market` header set by the edge router for top-level domain traffic
3. A `market` cookie set on first visit after detection

**Clerk multi-domain:** One Clerk application, multiple allowed domains. Each market subdomain added to `allowedRedirectOrigins`. No separate Clerk app per market — one auth graph, market-scoped data. This is the lowest-friction path; Clerk supports it natively.

> **OPEN FOR REVIEW:** Should `hmucashride.com` (no subdomain) be a marketing/landing page or should it perform market detection and redirect? A landing page approach is simpler; detection-and-redirect is better for SEO and user experience in active markets.

---

## Market Launch Automation

### The Market Lifecycle

```
PLANNED → WAITLIST → SOFT_LAUNCH → ACTIVE → (PAUSED | SUNSET)
```

| Status | What It Means | Who Can See It |
|---|---|---|
| PLANNED | Config in progress, no public surface | Admin only |
| WAITLIST | Blast funnel live, signups captured, no rides | Anyone with the link |
| SOFT_LAUNCH | Feed live, limited to waitlist access codes | Waitlist members only |
| ACTIVE | Full public access, organic growth | Everyone |
| PAUSED | Rides suspended, no new signups | Existing users only |
| SUNSET | Archived, data retained | Admin only |

Each `PLANNED → WAITLIST` and `WAITLIST → SOFT_LAUNCH` transition is gated by the Launch Checklist Agent. Transitions are one-click in admin once gates pass — no accidental promotion.

### Launch Checklist Agent

Runs every hour for markets in `planned` or `waitlist` status. Surfaces completion state in admin:

- [ ] Zip code data imported (minimum coverage defined)
- [ ] Neighborhoods defined (minimum 5)
- [ ] FB group linked and token valid
- [ ] Fee config reviewed (confirmed as global default or explicitly overridden)
- [ ] `launch_driver_target` and `launch_rider_target` set
- [ ] Blast campaign drafted and approved
- [ ] Waitlist landing page content filled in
- [ ] Legal review confirmed for that state/city (manual gate — admin checkbox)
- [ ] Driver target reached (for SOFT_LAUNCH gate)

> **OPEN FOR REVIEW:** What is the minimum driver count before you're willing to go live? 25 is proposed above. Should this be adjustable per market or fixed globally?

### Supply Bootstrapping Automation

The cold-start problem: no drivers → no riders → no drivers. Mitigation layers:

1. **Driver-first gate:** System enforces driver threshold before rider access. Not just a UI warning — the SOFT_LAUNCH transition is blocked until `launch_driver_target` is met.

2. **Blast funnel as driver acquisition:** `/blast?market=charlotte` is the primary driver recruitment surface. Blast signups auto-tag users to the correct market.

3. **Waitlist drip SMS:** Rider waitlist members receive cadenced SMS nudges ("Charlotte is 3 drivers away from going live — know someone?"). Message cadence and copy managed in admin per market.

4. **FB group seeding:** On market creation, Social Automation Agent posts a templated driver recruitment message to the configured FB group.

> **OPEN FOR REVIEW:** Should drivers in nearby markets be able to opt into serving a new market before it launches? E.g., ATL drivers opting into a Charlotte waitlist when visiting.

---

## Admin by Exception Model

The current admin model is inspect-and-act. At scale with 20+ markets, this breaks — an admin cannot watch 20 live maps simultaneously. The target model is **exception-surfaced**: the system makes routine decisions autonomously and elevates only genuine outliers.

### Exception Handlers

| Exception | Auto-Handler | Human Escalation Trigger |
|---|---|---|
| New driver signup | Auto-approve if Stripe onboarding complete + no fraud signals | Fraud flag OR manual review queue |
| Dispute filed | Auto-hold payout, notify both parties, start 45-min window | Both parties respond contradictorily |
| Ride abandoned mid-flow | Auto-expire after timeout, release hold | Rider disputes the charge |
| Driver goes offline mid-ride | Alert rider, flag for admin | — |
| Rating drops below threshold | Auto-flag account for review | chillScore < 60 → suspension queue |
| Market supply drops below floor | Auto-trigger driver recruitment SMS blast | — |
| Repeated fraud signals | Auto-suspend account | Suspension confirmed or appealed |
| Comment sentiment flags | Auto-hide, notify subject | Flagged content reviewed in batch |
| FB group token expiring | Admin alert 7 days prior | Token expired — automation paused |

### Market Health Score

The admin panel shows a single **health score** per market (0–100), not raw metrics. Anything below 70 surfaces in the exception queue. Score is a weighted composite of:

| Component | Weight | Notes |
|---|---|---|
| Supply/demand ratio | 30% | Driver online hours vs rider requests, last 24h |
| Ride completion rate | 25% | Completed / (completed + cancelled + abandoned) |
| Dispute rate | 20% | Open disputes / completed rides, last 7 days |
| Chill score distribution | 15% | % of users above threshold |
| Revenue vs target | 10% | Actual vs market-specific revenue goal |

> **OPEN FOR REVIEW:** Are these the right components and weights? Should revenue be in the health score at all, or kept separate as a business metric?

---

## Agentic Operations Framework

Agents run as Cloudflare Workers on cron schedules. Results written to an `agent_runs` table. Admin can view last-run result, last-run timestamp, and trigger manual runs from the admin panel.

### Agent Inventory

#### Market Health Agent
- **Cadence:** Every 15 minutes per active market
- **What it does:** Computes supply/demand ratio from Ably Presence data; compares to historical baseline for that market + day-of-week + hour; if demand > supply × 1.5, triggers driver availability SMS blast; posts health snapshot to `admin:feed` Ably channel
- **Output:** `market_health_snapshots` table row; admin dashboard update; conditional SMS blast

#### Fraud Pattern Agent
- **Cadence:** On every completed ride
- **What it does:** Scores ride against a feature vector: GPS coherence, time-to-distance ratio, repeat driver-rider pairs, payment instrument velocity, dispute history
- **v1:** Rule-based scoring with configurable thresholds per market
- **v2:** OpenAI function-calling for plain-English explanation of flags; labeled outcomes feed a feature store
- **Output:** Fraud flag on ride record; admin exception queue entry with explanation

#### Driver Activation Agent
- **Cadence:** Daily per market
- **What it does:** Identifies drivers who signed up but never went online; segments by days-since-signup (3d, 7d, 14d, 30d); sends segmented SMS nudges with market-specific copy; stops messaging after 3 no-responses in 30 days
- **Output:** SMS sends logged against driver record; conversion tracked

#### Rider Re-Engagement Agent
- **Cadence:** Weekly
- **What it does:** Identifies riders with 1+ completed rides who haven't posted in 14 days; sends personalized SMS referencing their last ride savings vs Uber
- **Output:** SMS sends; re-activation rate tracked in PostHog

#### Community Pulse Agent
- **Cadence:** Daily per market
- **What it does:** Aggregates rating distribution, comment sentiment scores, chill score movement; generates plain-English market health narrative via GPT-4o-mini; surfaces drivers approaching suspension threshold before they hit it
- **Output:** Admin in-app feed post; Slack notification (if configured)

#### Launch Readiness Agent
- **Cadence:** Every hour for `planned` and `waitlist` markets
- **What it does:** Tracks waitlist signup velocity; estimates days-to-launch based on trend; updates admin dashboard; triggers soft-launch checklist when thresholds met
- **Output:** Admin dashboard update; conditional transition prompt

#### Social Automation Agent
- **Cadence:** Scheduled per market (configurable cadence in admin)
- **What it does:** Posts templated driver acquisition content to FB group; posts rider "drivers are live now" alerts during peak hours; responds to common FB group questions using approved FAQ copy; surfaces unanswered comments for admin
- **Output:** FB Graph API posts; unanswered comment queue in admin

### Agent Infrastructure

```
lib/agents/
  market-health/       index.ts + types.ts
  fraud-pattern/       index.ts + feature-vector.ts
  driver-activation/   index.ts + segments.ts
  rider-reengagement/  index.ts
  community-pulse/     index.ts + narrative.ts
  launch-readiness/    index.ts + checklist.ts
  social-automation/   index.ts + fb-api.ts + templates.ts
  shared/
    agent-result.ts    AgentResult type
    market-context.ts  MarketContext loader
    run-logger.ts      Writes to agent_runs table
```

> **OPEN FOR REVIEW:** Are there additional agent types you'd want beyond these seven? E.g., a pricing recommendation agent, a scheduling optimization agent, or a referral/viral loop agent?

---

## Social & Community Automation

### Per-Market FB Group Integration

Each market record stores `fb_group_id` and a long-lived Page token (stored as Cloudflare Worker secret, keyed by market slug).

**Automated post cadence:**

| Trigger | Post Type | Copy Template |
|---|---|---|
| Market enters WAITLIST | Driver recruitment | "{city} drivers — HMU Cash Ride is coming. Get in early. Sign up: {url}" |
| Market enters SOFT_LAUNCH | Go-live announcement | "{city}, we're live. Riders, post your first HMU. Drivers, go online now." |
| Sunday 6pm local | Weekly supply summary | "Drivers available this week in {neighborhoods}. Book now: {url}" |
| Demand > supply × 2 | Surge alert | "Drivers needed NOW in {neighborhoods}. {url}" |
| Driver hits 10 completed rides | Milestone post (driver opts in) | "Shoutout to {handle} for 10 rides in {city}. 🔥" |

### Market-Specific Copy System

A `market_copy` table stores overridable string keys per market:

```sql
CREATE TABLE market_copy (
  market_id UUID REFERENCES markets(id),
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (market_id, key)
);
```

Keys like `brand.tagline`, `sms.driver_nudge_day3`, `fb.go_live_post` can be overridden per market. Falls back to global defaults. Admin manages these via the no-code admin panel — text fields with character counters, preview, and publish flow.

> **OPEN FOR REVIEW:** Should the Social Automation Agent also manage Instagram and TikTok? Those platforms have significantly different API access models. FB Group is the highest-leverage starting point given your demographic.

---

## Performance Optimization for Scale

### Database

| Optimization | Rationale |
|---|---|
| Market-prefixed indexes on all feed queries | `(market_id, status, created_at)` eliminates full-table scans as row count grows |
| Read replicas per region | Add as markets expand east/west/central — writes to primary, reads distributed |
| Archival policy | Rides > 90 days → `rides_archive`; ride locations > 30 days → purge; keeps hot tables fast |
| Connection pooling | Neon's pooled connection string already in use; validate pool size as concurrent markets grow |

### Cloudflare Edge

| Optimization | Rationale |
|---|---|
| Market config in KV | `platform_config` + `markets` data cached in KV per slug, 60s TTL; eliminates DB round-trip per request |
| Geo-routing at edge | `CF-IPCountry` + `request.cf.postalCode` → market detection without DB query |
| Ably channel isolation | Prefix channels with `market:{slug}:` — prevents cross-market data leakage, enables market-scoped token authorization |
| Per-market rate limit keys | Prefix Upstash keys with `market:{slug}:` — new markets with lower volume aren't throttled at ATL thresholds |

### Ably Channel Rename

| Current | Proposed |
|---|---|
| `area:{slug}:feed` | `market:{market}:area:{slug}:feed` |
| `ride:{ride_id}` | unchanged (ride_id is globally unique) |
| `user:{user_id}:notify` | unchanged (user_id is globally unique) |
| `admin:feed` | `admin:market:{market}:feed` + `admin:global:feed` |

> **OPEN FOR REVIEW:** Renaming Ably channels is a breaking change for any connected clients. This must be coordinated with a client release. Should we version channels instead (e.g., `v2:market:{slug}:area:{slug}:feed`) to allow gradual migration?

---

## Implementation Roadmap

### Phase 0 — Data Foundation (2–3 weeks, no visible user change)
- [ ] Add `markets`, `market_neighborhoods`, `market_zip_codes` tables
- [ ] Add `market_id` FK to `users`, `hmu_posts`, `rides`, `driver_profiles`, `rider_profiles`
- [ ] Seed `market_id = atl-uuid` for all existing records (additive migration, non-breaking)
- [ ] Move `platform_config` overrides to `markets.fee_config` JSONB (global config still works as fallback)
- [ ] Abstract Ably channel names to include market slug
- [ ] Add market detection middleware to Cloudflare Worker
- [ ] Blast funnel accepts `?market=` parameter

### Phase 1 — Admin Controls (1–2 weeks)
- [ ] Market management page: create, configure, transition status
- [ ] Neighborhood editor: add/remove neighborhoods + zip codes per market
- [ ] Market copy editor: per-market string overrides with preview
- [ ] Market health score dashboard (display only, Phase 0 data)
- [ ] FB group config fields + token storage

### Phase 2 — Multi-Market Routing (1 week)
- [ ] `hmucashride.com` top-level: market detection + redirect
- [ ] Clerk allowed origins updated for new market subdomains
- [ ] NOLA deployed as first non-ATL market (waitlist status)
- [ ] End-to-end validation: auth, ride flow, payment on NOLA subdomain

### Phase 3 — Launch Automation (2 weeks)
- [ ] Launch Readiness Agent
- [ ] Driver Activation Agent
- [ ] Rider Re-Engagement Agent
- [ ] Social Automation Agent (FB Group API)
- [ ] Agent cron triggers wired in Cloudflare Worker
- [ ] `agent_runs` table + admin observability UI

### Phase 4 — Market Health & Fraud (ongoing)
- [ ] Market Health Agent
- [ ] Community Pulse Agent
- [ ] Fraud Pattern Agent v1 (rule-based)
- [ ] Admin exception queue UI
- [ ] Fraud Pattern Agent v2 (ML-assisted, GPT-4o-mini explanations)

---

## Key Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Clerk subdomain proliferation breaks auth | Low | One Clerk app, add subdomains to `allowedRedirectOrigins` — no separate apps |
| Cold-start liquidity problem in new market | High | Enforce driver threshold before rider access; Blast funnel drives driver-first seeding |
| Fraud patterns differ by market | Medium | Fraud agent is market-parameterized; thresholds tunable per market in admin |
| Regulatory variation (TNC laws, insurance) | High | `status = 'planned'` gate; legal review checkbox gates the WAITLIST transition |
| FB API token expiration halts automation | Medium | Store token refresh dates; alert admin 7 days before expiry; automation gracefully pauses |
| Schema migrations break existing data | Low | Additive-only migrations; Neon branching for staging validation before prod |
| Ably channel rename breaks connected clients | Medium | Version channels; coordinate with client release; run old + new in parallel during migration |
| Agent runaway (duplicate SMS blasts) | Medium | Deduplication key on every agent action; idempotency enforced at DB level |

---

## What to Build First

**1. Phase 0 schema migration** (highest leverage, everything else depends on it)
The `market_id` FK migration is additive and non-breaking. Without it, every agent and routing feature requires retrofitting.

**2. Blast funnel market parameter** (fastest path to driver acquisition in new cities)
Making `/blast?market=charlotte` work is days of effort and immediately unlocks driver acquisition in any new city before routing or agent work is complete.

**3. Market Health Agent** (pays for itself in admin time saved, useful for ATL even before expansion)
Even without multi-market, this agent reduces watch time and speeds supply response in ATL.

---

## Open Questions

These items need decisions before or during implementation. Collected here for async review.

1. **Multi-market user membership:** Should a user have one home market or be able to operate freely across all markets? Affects matching logic and notification routing.

2. **Top-level domain behavior:** Should `hmucashride.com` be a marketing landing page or perform market detection and redirect?

3. **Neighborhood data source:** Manual entry vs OpenStreetMap import vs hybrid?

4. **Driver cold-start threshold:** Is 25 drivers the right minimum before SOFT_LAUNCH? Per-market or fixed global?

5. **Cross-market driver opt-in:** Should ATL drivers be able to opt into serving a new nearby market before it launches?

6. **Health score composition:** Are the proposed weights correct? Should revenue be in the health score?

7. **Additional agent types:** Pricing recommendation, scheduling optimization, referral/viral loop?

8. **Instagram/TikTok automation:** Scope to FB only for v1, or include others?

9. **Ably channel versioning strategy:** Hard rename vs versioned channels for gradual migration?

10. **Legal review gate:** Who owns the per-market legal review checkbox? Is it a manual admin step or does it require a structured compliance workflow?

---

*Related docs: [SCHEMA.md](./SCHEMA.md) · [MONETIZATION.md](./MONETIZATION.md) · [AGENT-BUILD-PLAN.md](./AGENT-BUILD-PLAN.md) · [CLAUDE.md](../CLAUDE.md)*
