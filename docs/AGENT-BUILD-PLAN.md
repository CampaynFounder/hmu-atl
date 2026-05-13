# AGENT BUILD PLAN — Development Roadmap

> **Part of HMU ATL documentation suite.** See [CLAUDE.md](../CLAUDE.md) for core project context.

---

## TIER 1 — FOUNDATION (Sequential — In This Exact Order)

```
01-schema-agent          Neon schema, TypeScript types, migrations
02-auth-agent            Clerk config, webhooks, Stripe Connect provisioning
03-infra-agent           Cloudflare setup, Ably architecture, env config
04-shared-components     Design system, 21st.dev installs, HMU card, rating widget
```

### Build Order Rationale
- **Schema first**: All other agents depend on database types
- **Auth second**: User model must exist before any feature work
- **Infra third**: Realtime + deployment architecture before UI
- **Components last**: Design system needed before feature agents start UI work

---

## TIER 2 — FEATURE (Parallel After Tier 1)

```
05-driver-profile        Profile UI, video upload, HMU First sub flow
06-rider-profile         Profile UI, OG Status display, payment link
07-hmu-broadcast         Feed UI, Ably Presence, area matching logic
08-ride-tracking         Status machine, GPS, Mapbox, ride UI
09-transaction           Stripe escrow hold/capture, COO flow
10-dispute               45min timer, dispute UI, admin queue
11-payout                Tier-based payout, instant vs batch
12-engagement            Rating UI, comments, sentiment, OG auto-upgrade
13-admin                 Live map, dispute queue, account management, video review queue
14-notification          Web Push + Twilio, countdown notifications
15-analytics             PostHog events on every user action
```

### Parallel Work Strategy
- **Core flow agents** (05-08): Can run in parallel, minimal cross-dependencies
- **Money agents** (09-11): Should sequence (09 → 11, 10 can run parallel)
- **Engagement + Admin** (12-13): Can run parallel
- **Notification + Analytics** (14-15): Cross-cutting, can start once core flow exists

---

## TIER 3 — CROSS-CUTTING (Parallel — Last)

```
16-security              Rate limiting, middleware audit, Stripe Radar rules
17-qa-testing            Integration tests, Playwright E2E
18-marketing             SEO pages, social share cards, virality loop
19-deployment            Cloudflare deploy — runs only after QA passes
```

### Pre-Launch Checklist
- [ ] All Tier 2 agents complete
- [ ] Security audit (16) passed
- [ ] QA tests (17) green
- [ ] Marketing pages (18) live
- [ ] Deployment (19) dry-run successful

---

## ALL AGENTS MUST FOLLOW THESE RULES

1. **NEVER modify Neon schema directly** — route all changes through Schema Agent
2. **Import TypeScript types from `/lib/db/types.ts` only**
3. **All API routes must have Clerk auth middleware**
4. **All API routes must have Upstash rate limiting**
5. **Every user action fires a PostHog event**
6. **Commit to your own Git branch** — never commit to main directly
7. **Document your owned files in your SCOPE section** (append to CLAUDE.md)

---

## DEFINITION OF DONE (MVP)

A feature is complete when all of the following are true:

- [ ] Renders correctly on mobile Chrome at 390px width
- [ ] Clerk auth middleware protects the route
- [ ] Writes to Neon (source of truth — not just Ably)
- [ ] Ably event fires if it is a realtime feature
- [ ] PostHog event fires for the user action
- [ ] Upstash rate limiting applied
- [ ] Sentry error boundary in place
- [ ] Passes QA Agent integration tests

---

## FAST FOLLOW — NEXT SESSION PRIORITIES

These are built in schema but NOT yet implemented in code:

| Priority | Feature | Status |
|---|---|---|
| P0 | Price negotiation flow (3 modes) | Schema ready, `lib/payments/negotiation.ts` needed |
| P0 | Payment workflow orchestrator | Schema ready, `lib/payments/workflow.ts` needed |
| P1 | Transaction ledger queries | Table exists, `lib/payments/ledger.ts` needed |
| P1 | Payout router (Stripe transfers + batch) | `lib/payments/payout-router.ts` needed |
| P1 | Stripe webhook handler (full) | Expand `app/api/webhooks/stripe/route.ts` |
| P2 | Real-time financial UI via Ably | Push payment events to ride channel |
| P2 | Rider payment UI (saved cards, add/remove) | Frontend components needed |
| P2 | Driver earnings visualization (daily/weekly) | Frontend components needed |
| P3 | Dots integration | Blocked on Dots API access ($999/mo) — evaluate alternatives |
| P3 | Price auto-calculator with Turf.js | `lib/payments/price-calculator.ts` |

---

## HMU/LINK FEATURE (Phase 1 — Schema Shipped 2026-04-23, UI/API Pending)

Driver-to-rider directed interest signal with match-on-link unmasking. Schema is live; full spec at `memory/hmu_link_feature_phase1.md`.

| Priority | Piece | Status |
|---|---|---|
| P0 | `POST /api/driver/hmu` — send HMU (enforce cap, insert into `driver_to_rider_hmus`, Ably push, insert notification) | New |
| P0 | `POST /api/rider/hmu/[id]/link` — flip status to `linked`, set `linked_at`, notify driver | New |
| P0 | `POST /api/rider/hmu/[id]/dismiss` — status `dismissed`, insert `blocked_users` row (rider → driver, one-way) | New |
| P0 | `POST /api/rider/linked/[driverId]/unlink` — status `unlinked`, re-masks rider | New |
| P0 | `/driver/find-riders` page — masked rider cards, HMU button, daily cap counter | New — reuse 4:3 media container from `/rider/browse` |
| P0 | `/rider/linked` page — accepted drivers, existing booking flow CTA | New |
| P0 | `/rider/home` — "HMU'd you" inbox section with badge count from `user_notifications` | Extend |
| P1 | Driver Ably presence on `market:{slug}:drivers_available` (token already permits subscription; publisher missing) | New |
| P1 | `/admin/hmu-config` + `/admin/hmus` — market-filtered via `useMarket()` pattern | New |
| P1 | Gender data normalization — `driver_profiles.gender` has mixed legacy (`male`/`female`) + new (`man`/`woman`) values. Normalize to one vocab, backfill `users.gender`. | Data cleanup |
| P2 | Rider `home_areas` picker in settings (reuse driver area-picker) | New |
| P2 | Cloudflare Images blurhash for masked avatars (MVP uses CSS blur which is DevTools-bypassable) | Upgrade |
| P2 | voip.ms proxy pair for in-HMU messaging (Phase 2 of the feature) | New |

**Phase 1 status (2026-04-23):** schema + gender filter on `/rider/browse` shipped. API + UI to be picked up in dedicated session — do NOT wedge into unrelated work.

---

## ADMIN RBAC — Finish Route Mapping (Shipped 2026-04-30 as Default-Deny)

13 admin routes (Safety, Ride Requests, HMUs, Markets, Feature Flags, HMU Config, Onboarding Config, Realtime Banners, Maintenance, VoIP Debug, Playbook FB Groups, Conversation Agent, Chat Booking) currently have no `permission` slug. The sidebar + search filter default-denies them to non-super admins as a stopgap. To support partial access for custom roles, give each route an explicit slug, add to the matrix in `app/admin/roles/permission-matrix.tsx`, and tag in both `app/admin/components/admin-sidebar.tsx` and `lib/admin/search-manifest.ts`. Full proposed slug-per-route mapping at `memory/rbac_unmapped_routes_followup.md`.

---

## POST-MVP ROADMAP (Schema Must Accommodate)

| Phase | Feature |
|---|---|
| Post-MVP v1 | Service Booking (Barber, Tattoo) — separate flow, own agent |
| Post-MVP v1 | Pickup/Delivery (Grocery, Products) — own state machine |
| Post-MVP v1 | SMS → App: text "HMU $15 Rides Decatur" → auto-creates post via Twilio webhook |
| Post-MVP v2 | Driver background check (optional paid add-on) |
| Post-MVP v2 | Ride scheduling (book for tomorrow, recurring) |
| Post-MVP v2 | Referral system ($5 credit) |
| Post-MVP v3 | OG Rider paid fast-track |
| Post-MVP v3 | In-app pre-ride chat |

---

## RELATED DOCS
- [CLAUDE.md](../CLAUDE.md) — Core project context, tech stack, deployment
- [Schema](./SCHEMA.md) — Database schema all agents depend on
- [UI Components](./UI-COMPONENTS.md) — Design system (Agent 04 owns)
- [Payments](./PAYMENTS.md) — Transaction Agent (09) + Payout Agent (11) requirements
- [Ride Flow](./RIDE-FLOW.md) — Ride Tracking Agent (08) requirements
