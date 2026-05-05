# Admin Dashboards — Feature Spec

> **Status:** APPROVED — decisions ratified 2026-05-04. Ready for Phase 0.
> **Created:** 2026-05-04
> **Ratified:** 2026-05-04
> **Owner:** TBD (likely extension of `13-admin` agent scope)
> **Depends on:** existing RBAC (`admin_roles`, `lib/admin/route-permissions.ts`, `app/admin/layout.tsx`), market scoping (`useMarket()` + `users.admin_market_ids`), `/api/admin/*` data-fetch pattern.

---

## 1. Goal

Let a **superadmin** assemble configurable dashboards from a registry of pre-built **data blocks**, then grant **specific admin roles** the right to view each dashboard. Two dashboard scopes:

1. **`user_detail`** — bound to one `userId`. Admin opens it from `/admin/users/[id]?dashboard=<slug>` and sees the configured blocks for that user (profile basics, driver areas, rider areas, HMU/Link history, rides, ratings, etc.).
2. **`market_overview`** — aggregate view scoped to the active market. Renders at `/admin/dashboards/[slug]` (e.g. driver supply by area, rider demand by area, HMU funnel by area).

Every block is **market-aware** by default (filtered by `useMarket()` selection unless cross-market explicitly granted). Blocks are typed code modules — superadmin assembles existing blocks, **does not write SQL**.

---

## 2. Decisions made

| Area | Decision |
|---|---|
| Architecture | **Curated block registry**, not a generic query builder. Each block is a typed TS module with its own SQL, config schema, and React component. |
| Block authorship | **Engineers**, via PR. Adding a block ≠ no-code; superadmin only assembles existing blocks. |
| Two scopes | `user_detail` (one user) and `market_overview` (aggregate). No `list_view` scope in v1 — list pages stay hardcoded. |
| Market scoping | Every `marketAware` block receives `marketId` from `useMarket()`. Cross-market access requires `users.admin_market_ids = NULL` (existing rule). |
| Permission model | Per-dashboard grant via **new join table** `admin_dashboard_role_grants(dashboard_id, role_id)`. Reasons: clean cascade on delete, no slug bloat in `admin_roles.permissions[]` matrix, no auto-mint logic. |
| Field-level RBAC | **Out of scope for v1.** If two roles need different views of the same user data, build two dashboards. |
| Edit gate | Only `is_super=true` admins create/edit/delete dashboards. No `dashboards.edit` permission slug. |
| Builder UX | **Form-based v1** (pick blocks from a list, set order, optional config per block). Drag-and-drop is Phase 3. |
| Block config | Per-block JSONB config in `admin_dashboard_blocks.config`. Schema validated by Zod at API layer. Config example: `{ "limit": 20, "since": "30d" }` for `user.rides`. |
| User search | New `<UserSearchPicker>` component (typed filters: name, phone, email, market, profile_type). **Not** raw SQL. Powers the "open user_detail dashboard" entry point. |
| Audit | Every dashboard CRUD action writes to existing `admin_audit_log`. Every dashboard render writes one `dashboard_view` event (not per block). |
| Data access pattern | Same as today: each block exposes a server-side `fetch()` that runs `sql\`...\`` via Neon HTTP client. Block fetchers called from `/api/admin/dashboards/[id]/data`. |
| **P1** Permission storage | **Join table `admin_dashboard_role_grants`**, not auto-minted slugs in `admin_roles.permissions[]`. Cleaner cascade on delete; keeps the route-level permission matrix from bloating as dashboards multiply. |
| **P2** Drafts / version history | **None.** Hard delete; edits go live immediately; `admin_audit_log` captures who/when. Add drafts later only if founder hits a "save WIP" pain point. |
| **P3** Default user-detail builtin | **Seed `default-user-profile`** in code — `is_builtin=true`, undeletable. Repackages today's inline `user-profile.tsx` content. Avoids empty state on day 1. |
| **P4** Market filter in `user_detail` | **Per-block `marketScope` declaration** (see §5.1). Three options: `viewed_user` (used by area blocks), `admin_active` (default), `admin_all_allowed` (used by HMU history, rides — cross-market activity is real signal, not noise). |
| **P5** Aggregate cache | **No prebuilt cache.** Live SQL per render. Add a cache table + cron only when a block trips the >500ms p95 alert in Phase 4. |

---

## 3. Decisions resolved 2026-05-04

All five P-decisions ratified and merged into §2. P4 confirmed with a refinement: instead of a single global rule, each market-aware block declares its own `marketScope` (see §5.1 type contract). This handles the asymmetry that area-shaped blocks belong to one market, while activity-shaped blocks (rides, HMUs) cross markets.

---

## 4. Schema

### 4.1 `admin_dashboards`
```sql
CREATE TABLE admin_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,                                   -- e.g. 'driver-routing-view'
  label TEXT NOT NULL,
  description TEXT,
  scope TEXT CHECK (scope IN ('user_detail', 'market_overview')) NOT NULL,
  market_id UUID REFERENCES markets(id),                       -- NULL = available across all markets
  is_builtin BOOLEAN DEFAULT FALSE,                            -- code-seeded, not user-deletable
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_admin_dashboards_scope ON admin_dashboards(scope);
CREATE INDEX idx_admin_dashboards_market ON admin_dashboards(market_id);
```

### 4.2 `admin_dashboard_blocks`
```sql
CREATE TABLE admin_dashboard_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID REFERENCES admin_dashboards(id) ON DELETE CASCADE,
  block_key TEXT NOT NULL,                                     -- 'user.driver_areas' (must exist in registry)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,                   -- per-block knobs, validated by registry Zod
  sort_order INTEGER NOT NULL,
  col_span INTEGER DEFAULT 12 CHECK (col_span BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_admin_dashboard_blocks_dashboard ON admin_dashboard_blocks(dashboard_id, sort_order);
```

### 4.3 `admin_dashboard_role_grants`
```sql
CREATE TABLE admin_dashboard_role_grants (
  dashboard_id UUID REFERENCES admin_dashboards(id) ON DELETE CASCADE,
  role_id UUID REFERENCES admin_roles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (dashboard_id, role_id)
);
```

Authorization rule (server-side):
```
admin can view dashboard D iff
  admin.is_super = TRUE
  OR EXISTS (admin_dashboard_role_grants WHERE dashboard_id = D.id AND role_id = admin.admin_role_id)
```

### 4.4 No changes to existing tables
- `admin_roles` untouched.
- `admin_audit_log` reused for CRUD events (`dashboard.created`, `.updated`, `.deleted`, `.role_granted`, `.role_revoked`).
- `users`, `driver_profiles`, `rider_profiles`, `driver_to_rider_hmus`, `rides`, `ratings`, `market_areas` untouched — blocks only read.

---

## 5. Block registry

### 5.1 Type contract

```ts
// lib/admin/dashboards/blocks/types.ts
export type BlockScope = 'user' | 'market' | 'global'

export type MarketScopeStrategy =
  | 'viewed_user'         // use users.market_id of the user being viewed (area-shaped blocks)
  | 'admin_active'        // use the market the admin has selected via useMarket() — DEFAULT
  | 'admin_all_allowed'   // no market filter; show everything within admin.admin_market_ids (cross-market activity)

export interface BlockDefinition<TConfig = unknown, TData = unknown> {
  key: string                          // stable identifier, e.g. 'user.driver_areas'
  label: string                        // builder UI display
  description: string                  // builder UI tooltip
  scope: BlockScope                    // must match parent dashboard scope
  marketAware: boolean                 // if true, fetcher receives marketId(s) per marketScope
  marketScope?: MarketScopeStrategy    // ignored unless marketAware && scope === 'user'; defaults to 'admin_active'
  configSchema: ZodSchema<TConfig>     // validates row in admin_dashboard_blocks.config
  defaultConfig: TConfig
  fetch: (ctx: BlockFetchContext, config: TConfig) => Promise<TData>
  Component: React.ComponentType<{ data: TData; config: TConfig }>
}

export interface BlockFetchContext {
  marketIds: string[] | null           // resolved per block.marketScope: single id, list of allowed ids, or null = no filter
  userId?: string                      // present iff parent dashboard scope === 'user_detail'
  adminUserId: string                  // for audit + per-row visibility checks
}
```

**Why `marketIds: string[] | null`?** A `marketScope: 'admin_all_allowed'` block needs to filter by every market the admin can see, not one. The data API resolves the strategy → list before calling `fetch()`, so block authors write one SQL pattern (`WHERE market_id = ANY(${marketIds})` or skip the clause if null) regardless of strategy.

Registry is a typed object map at `lib/admin/dashboards/blocks/registry.ts`. New blocks added by appending an entry. The builder UI iterates the registry to populate the "add block" picker.

### 5.2 v1 block list (user_detail scope) — 9 blocks

| Key | `marketScope` | Reads | Notes |
|---|---|---|---|
| `user.basics` | n/a (not marketAware) | `users` + handle / display name / tier / og_status / chill_score / completed_rides / dispute_count / account_status | Always visible on `default-user-profile` builtin |
| `user.verification` | n/a | Phone-verified flag, video intro review status, Stripe Connect onboarding state, payment-readiness | Highest-frequency support question is "why can't this driver get paid" |
| `user.driver_areas` | `viewed_user` | `driver_profiles.area_slugs` joined with `market_areas`; `services_entire_market`, `accepts_long_distance`, `heading_towards` | Areas belong to one market — show in viewed user's market |
| `user.rider_areas` | `viewed_user` | Distinct pickup/dropoff `pickup_area_slug` / `dropoff_area_slug` from rider's recent `hmu_posts` | If `rider_home_areas` table ships later, prefer that |
| `user.hmu_history` | `admin_all_allowed` | `driver_to_rider_hmus` where `driver_id = user.id` OR `rider_id = user.id`, grouped by status (`pending` / `linked` / `dismissed` / `unlinked`) | Cross-market activity is real signal — don't hide it; renders "sent" + "received" sections when user has both profile types |
| `user.rides` | `admin_all_allowed` | `rides` where `driver_id = user.id` OR `rider_id = user.id`, last N ordered by `created_at` | Config: `limit` (default 20), `status_filter` (default all) |
| `user.ratings` | n/a | `ratings` where `rated_id = user.id`, broken down by `rating_type` (CHILL / Cool AF / Kinda Creepy / WEIRDO) | Includes computed Chill Score |
| `user.disputes` | `admin_all_allowed` | `disputes` linked via `rides` to user as driver or rider; open vs resolved counts + last 5 | Pulled forward from Phase 2 — safety/support workflows need it on day 1 |
| `user.admin_notes` | n/a | `admin_notes` rows targeting this user | **Verify before Phase 1**: confirm `admin_notes` table has a `target_user_id` (or equivalent FK) — schema came from the marketing-page notepad commit (2026-05-04) and may be page-scoped only. If it isn't, either extend the table with `target_user_id` or defer this block to Phase 2 |

### 5.3 v1 block list (market_overview scope) — 4 blocks

Phase 2 — not built in Phase 1. Listed here so schema doesn't need to change. All `marketScope = 'admin_active'` (uses the active market from `useMarket()`).

| Key | Reads | Notes |
|---|---|---|
| `market.driver_supply_by_area` | `driver_profiles` joined with `market_areas` — count of `profile_visible` drivers per area | Heatmap-friendly output |
| `market.rider_demand_by_area` | `hmu_posts` where `post_type = 'rider_request'` AND `status = 'active'`, grouped by `pickup_area_slug` | Rolling 7-day window |
| `market.unmatched_demand` | `hmu_posts` where `post_type = 'rider_request'` AND `status = 'expired'`, grouped by `pickup_area_slug` | Operational counterpart to supply: where do riders ask without getting picked up? Drives growth/recruiting decisions |
| `market.hmu_funnel_by_area` | `driver_to_rider_hmus` joined to driver's areas — sent / linked / dismissed counts per area | Funnel signal per area |

### 5.4 What blocks are NOT allowed to do
- No raw user-supplied SQL anywhere.
- No reading PII outside the block's documented columns (e.g. `user.basics` does not return Stripe tokens).
- No mutations. Blocks are read-only. Any "act" buttons live in dedicated admin pages, not dashboards.
- No cross-block joins at the SQL layer — each block runs an independent query. If two blocks need shared data, refactor to one block.

---

## 6. Flow

### 6.1 Superadmin creates a dashboard
1. Superadmin navigates to `/admin/dashboards`.
2. Clicks "New dashboard."
3. Form fields:
   - Slug (kebab-case, validated unique)
   - Label, description
   - Scope (`user_detail` | `market_overview`)
   - Market binding: "All markets" or pick one
   - Block list — add blocks from registry filtered by scope; for each block, optional config form rendered from `configSchema`; reorderable.
   - Role access — multi-select from `admin_roles` (excluding `is_super` since they always see everything).
4. Submits → `POST /api/admin/dashboards` writes `admin_dashboards` + `admin_dashboard_blocks` + `admin_dashboard_role_grants` rows in one transaction.
5. Audit row written: `dashboard.created`.

### 6.2 Admin opens a `user_detail` dashboard
1. Admin lands on `/admin/users/[id]`.
2. Page server-loads:
   - Viewed user's basics
   - List of dashboards admin has access to where `scope = 'user_detail'`
3. Tab strip across the top — one tab per accessible dashboard. Default = `default-user-profile` builtin (P3) or first-by-sort.
4. Selecting a tab updates URL `?dashboard=<slug>`.
5. For each block in the dashboard, page calls `GET /api/admin/dashboards/[id]/data?userId=<id>`:
   - Server enforces grant check.
   - For each block: validates config, runs `fetch(ctx, config)`, returns array of `{ blockId, data }`.
6. Client renders blocks via `Component` from registry, passing `data` and `config`.
7. PostHog event: `admin_dashboard_viewed` with `{ dashboardSlug, scope, userId }`.

### 6.3 Admin opens a `market_overview` dashboard
1. Admin navigates to `/admin/dashboards/[slug]`.
2. Server enforces grant check + market access.
3. Active market from `useMarket()` passed to every `marketAware` block.
4. Same render pipeline as 6.2 minus `userId`.

### 6.4 Superadmin edits a dashboard
- `/admin/dashboards/[id]/edit` — same form as create, prefilled. Save = full replace of block list and grant list inside one transaction. No version history (per Decision P2).
- Audit: `dashboard.updated` with diff of changed fields.

### 6.5 Superadmin deletes a dashboard
- Soft delete? **No. Hard delete.** Cascades to blocks + grants. Builtin dashboards (`is_builtin = true`) cannot be deleted.
- Audit: `dashboard.deleted`.

### 6.6 User search (entry point to `user_detail`)
- New `<UserSearchPicker>` component used in admin shell + on `/admin/dashboards/[slug]` for `user_detail` dashboards (so admin can pick a user without going through the user list).
- Filters: name (ILIKE), phone (digits-only normalized), email, profile_type, market_id (defaults to active market). Returns top 25 with display name, handle, profile type, market label.
- Backed by `GET /api/admin/users/search?q=...&market_id=...&profile_type=...`. Reuses existing user-fetch SQL with extra `WHERE` clauses.

---

## 7. Admin portal

### 7.1 New routes
- **`/admin/dashboards`** — list all dashboards (with grant count, view count, last-edited). Superadmin only for create/edit; non-super admins see only dashboards they can view, listed for navigation.
- **`/admin/dashboards/new`** — create form.
- **`/admin/dashboards/[id]/edit`** — edit form.
- **`/admin/dashboards/[slug]`** — render `market_overview` dashboard.

### 7.2 Extended routes
- **`/admin/users/[id]`** — **NEW route** (today the user detail is inline in `UserManagement`). This page becomes the host for `user_detail` dashboards. The existing inline detail in `app/admin/users/user-profile.tsx` is repackaged as the seed for the `default-user-profile` builtin dashboard.
- **`/admin/roles`** — permission matrix gets a new "Dashboards" section listing each non-builtin dashboard with role checkboxes. Backed by `admin_dashboard_role_grants`.
- **`/admin/audit`** — show `dashboard.*` events alongside existing entries.

### 7.3 Sidebar
- Add "Dashboards" entry under existing Monitor section, visible to anyone who has at least one grant or is superadmin. Resolved via existing `lib/admin/search-manifest.ts` pattern.

### 7.4 RBAC entries
In `lib/admin/route-permissions.ts`:
```ts
// Hard-gate the builder to superadmin only.
{ pattern: '/admin/dashboards/new', rule: { kind: 'super_only' } },
{ pattern: '/admin/dashboards/:id/edit', rule: { kind: 'super_only' } },

// Read routes are gated dynamically per dashboard via grants table; the route
// permission is just "has at least one accessible dashboard."
{ pattern: '/admin/dashboards', rule: { kind: 'open_to_all_admins' } },
{ pattern: '/admin/dashboards/:slug', rule: { kind: 'dynamic_grant_check' } },
{ pattern: '/admin/users/:id', rule: { kind: 'permission', slug: 'act.support' } },
```
The two new rule kinds (`super_only`, `dynamic_grant_check`) extend `canAccess()` in `lib/admin/route-permissions.ts`.

---

## 8. APIs

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/admin/dashboards` | List dashboards visible to admin | Any admin |
| POST | `/api/admin/dashboards` | Create dashboard + blocks + grants | Super only |
| GET | `/api/admin/dashboards/[id]` | Read dashboard config | Any admin with grant |
| PATCH | `/api/admin/dashboards/[id]` | Update dashboard (full replace of blocks + grants) | Super only |
| DELETE | `/api/admin/dashboards/[id]` | Hard delete (blocked if `is_builtin`) | Super only |
| GET | `/api/admin/dashboards/[id]/data` | Run all blocks, return `{ blockId, data }[]`. Query params: `userId` (required for `user_detail`), `marketId` (defaults from active market) | Any admin with grant |
| GET | `/api/admin/dashboards/blocks` | Return registry metadata (key, label, description, scope, configSchema) for builder UI | Super only |
| GET | `/api/admin/users/search` | Typed user search for `<UserSearchPicker>` | Any admin |

All endpoints: Clerk session → `requireAdmin()` → grant/super check → Upstash rate limit → PostHog event.

---

## 9. Reuse map

What this feature reuses without modification:
- `admin_roles` table (existing role definitions)
- `users.admin_role_id` + `users.admin_market_ids` (existing admin user model)
- `requireAdmin()` from `lib/admin/helpers.ts`
- `canAccess()` route gating in `app/admin/layout.tsx`
- `useMarket()` hook + `MarketProvider` context
- `admin_audit_log` table + write helper
- `/api/admin/users` SQL patterns for user fetches
- Neon HTTP client (`sql`...`` template tag) for all block queries
- `app/admin/users/user-profile.tsx` rendering primitives — repackaged into `user.basics`, `user.rides`, `user.ratings` blocks

What's net new:
- 3 tables (above)
- Block registry (~6 blocks for v1)
- Dashboard CRUD APIs + data API
- Builder pages (`/admin/dashboards/new`, `/edit`)
- `/admin/users/[id]` route (today only inline)
- `<UserSearchPicker>` component
- Two new `canAccess()` rule kinds (`super_only`, `dynamic_grant_check`)

---

## 10. Out of scope for v1

- Field-level RBAC (different roles, different columns of same block)
- No-code block authoring (block remains a typed PR)
- Drag-and-drop builder (form-based v1)
- Draft / preview / version history of dashboards
- Cron-prebuilt aggregate caches (Decision P5)
- Cross-block SQL joins
- Embedding dashboards anywhere outside `/admin/`
- Saved per-admin filters on a block ("my view" of a dashboard)
- Export to CSV / scheduled emails
- Conditional block visibility ("only show this block if user is a driver") — push this into the block's own render logic via empty state
- `list_view` scope (lists like `/admin/users`, `/admin/disputes` stay hardcoded)

---

## 11. Implementation phases

### Phase 0 — schema + RBAC plumbing + user search ✅ SHIPPED 2026-05-04
- ✅ Migration `lib/db/migrations/2026-05-04-admin-dashboards.sql` — 3 new tables + `admin_notes.target_user_id` column. **Pending manual apply to Neon — no migration runner in this project.**
- ✅ TypeScript types added to `lib/db/types.ts`: `DashboardScope`, `AdminDashboard`, `AdminDashboardBlock`, `AdminDashboardRoleGrant`, `AdminUserSearchResult`
- ✅ `/admin/dashboards` registered as super-only in `lib/admin/route-permissions.ts` (existing `super` rule kind sufficient — `canAccess()` extension deferred to Phase 2 when market_overview viewer ships)
- ✅ Audit event constants in `lib/admin/dashboards/audit-events.ts`
- ✅ `<UserSearchPicker>` at `app/admin/components/user-search-picker.tsx` + `/api/admin/users/search` endpoint
- ✅ `admin_notes` verification: schema has NO per-user FK; migration adds optional `target_user_id`. NULL preserves existing scratchpad semantics. Marketing notepad routes (`/api/admin/marketing/notes/*`) updated to filter `WHERE target_user_id IS NULL` so the migration is backward-compatible.

### Phase 1 — block registry + user_detail end-to-end ✅ SHIPPED 2026-05-04

- ✅ `lib/admin/dashboards/blocks/types.ts` — `BlockDefinition`, `MarketScopeStrategy`, `BlockFetchContext`
- ✅ `lib/admin/dashboards/blocks/registry.ts` — typed registry + builder metadata helper
- ✅ 9 v1 blocks: `user.basics`, `user.verification`, `user.driver_areas`, `user.rider_areas`, `user.hmu_history`, `user.rides`, `user.ratings`, `user.disputes`, `user.admin_notes`
- ✅ `lib/admin/dashboards/runtime.ts` — market-scope resolver, dashboard loaders, grant check (with `ALWAYS_VISIBLE_BUILTIN_SLUGS` bypass for `default-user-profile`), parallel block fetching
- ✅ `lib/admin/dashboards/builtins.ts` — code-defined seeds with `default_grant_permissions` reconcile + `ensureBuiltinsReconciled()` once-per-process gate
- ✅ All 5 builtins seeded into prod Neon: `default-user-profile`, `support-user-overview`, `safety-user-review`, `driver-coverage-review`, `rider-history`
- ✅ `app/admin/users/[id]/page.tsx` — server-rendered route with tab strip + block grid
- ✅ Full CRUD + data APIs: `/api/admin/dashboards` (GET/POST), `/api/admin/dashboards/[id]` (GET/PATCH/DELETE), `/api/admin/dashboards/[id]/data` (GET — runs blocks), `/api/admin/dashboards/blocks` (GET registry metadata)
- ✅ Builder pages: `/admin/dashboards` (list), `/new`, `/[id]/edit` — super only, form-based, blocks reorder via up/down buttons (drag-drop is Phase 3)
- ✅ Inline `UserManagement` modal retired — list rows now `router.push('/admin/users/[id]')`

**Phase 1 follow-ups (not blockers, can ship anytime):**
- Port `user-profile.tsx` admin action features (send SMS, account suspension, visibility toggle) into action buttons on `/admin/users/[id]`. The file is orphaned but kept in place as a reference until ported.
- Add a "Dashboards" pivot to `/admin/roles` matrix (the API supports grant management via PATCH, but the matrix UI doesn't list dashboards yet).
- Schema-aware config UI per block (today is JSON textarea seeded from `defaultConfig`; full UI is Phase 3).

### Phase 2 — market_overview scope
- 4 v1 market blocks (§5.3): driver_supply_by_area, rider_demand_by_area, unmatched_demand, hmu_funnel_by_area
- `/admin/dashboards/[slug]` route
- Sidebar entry under Monitor
- One seeded builtin: `market-supply-demand`

### Phase 3 — builder UX polish
- Drag-and-drop reorder
- Inline preview while editing
- Block-config forms generated from Zod schemas (zod-to-form)
- Search/filter the registry inside the builder
- Per-block error boundaries — one bad block doesn't sink the whole dashboard

### Phase 4 — observability + iteration
- Per-dashboard view counts in list page
- Slow-block alerts (auto-flag any block >500ms p95 → consider for Phase 5 caching)
- PostHog funnel: dashboard created → first non-super view → repeat view in 7d

---

## 12. Key risks

1. **Permission leak via blocks.** A new block accidentally returns sensitive columns. Mitigation: block reviews are PR-gated; block fetcher must use a curated selector function (e.g. `safeUserFields`), not `SELECT *`.
2. **N+1 SQL when many blocks render.** Each block runs its own query; a 10-block dashboard = 10 round-trips. Mitigation: data API runs block fetchers with `Promise.all`. If still slow at p95, add per-dashboard cache (Decision P5).
3. **Dashboard sprawl.** Superadmin builds 40 niche dashboards, no one knows which to use. Mitigation: list page shows "last viewed" + "view count last 30d"; archive (soft delete) is Phase 3.
4. **Block deletion / rename breaking dashboards.** Engineer removes `user.driver_areas` from registry, all dashboards using it crash. Mitigation: registry has a `deprecated: true` flag — block still renders an empty state but is hidden from builder; data API logs but doesn't throw on unknown `block_key`.
5. **Cross-market access via market binding.** Admin restricted to Atlanta opens a dashboard with `market_id = NULL` containing a non-marketAware block — leaks data. Mitigation: when admin's `admin_market_ids` is set, server **forces** a market filter on every marketAware block; non-marketAware blocks have to declare it explicitly and pass a separate review.
6. **Schema drift.** A block's `config` JSONB shape changes; old rows have stale shape. Mitigation: registry's `configSchema` parses with defaults filled in, so missing fields hydrate from `defaultConfig`.

---

## 13. Founder review — RATIFIED 2026-05-04

All nine items resolved. Summary of outcomes:

- ✅ **P1–P5** confirmed (P4 with refinement → per-block `marketScope` declaration in §5.1)
- ✅ **§5.2 block list** — added 3 blocks beyond the original six: `user.verification`, `user.disputes`, `user.admin_notes` (admin_notes pending schema verification — see Phase 0)
- ✅ **§5.3 block list** — added `market.unmatched_demand` for Phase 2
- ✅ **Form-based builder v1** — drag-and-drop deferred to Phase 3
- ✅ **Field-level RBAC out of scope** — sensitive blocks get their own permission slug (e.g. `act.support.pii`) when introduced; no per-column rules
- ✅ **Hard delete, no version history** — `admin_audit_log` is sufficient
- ✅ **`/admin/users/[id]` becomes a real route** — inline `UserManagement` modal retired in Phase 1
- ✅ **Phase ordering** — `<UserSearchPicker>` pulled forward to Phase 0 (otherwise unchanged)
- ✅ **Named builtins** — five seeded user_detail dashboards listed in §14, plus `market-supply-demand` (Phase 2)

---

## 14. Seeded builtins

Five user_detail dashboards are seeded in code at Phase 1 (`is_builtin = true`, undeletable, can be cloned). Their `admin_dashboard_role_grants` rows are inserted by the same seeder, keyed by role slug rather than UUID so seeds are stable across environments.

| Slug | Purpose | Blocks (in order) | Default grants (admin_role slug) |
|---|---|---|---|
| `default-user-profile` | Empty-state fallback for `/admin/users/[id]` when no `?dashboard=` is set | `user.basics`, `user.rides`, `user.ratings` | All non-super roles (everyone with access to `/admin/users/[id]`) |
| `support-user-overview` | Front-line support: account state, payment readiness, recent activity, prior notes | `user.basics`, `user.verification`, `user.rides`, `user.admin_notes` | Roles with `act.support` |
| `safety-user-review` | Safety / trust: rating signal, dispute pattern, link history, ride history | `user.basics`, `user.ratings`, `user.disputes`, `user.hmu_history`, `user.rides` | Roles with `act.safety` |
| `driver-coverage-review` | Ops/growth: where this driver runs, reliability, account state | `user.basics`, `user.driver_areas`, `user.rides`, `user.ratings`, `user.verification` | Roles with `monitor.liveops` OR `grow.outreach` |
| `rider-history` | Rider-side support: where they need rides, who they've linked with, recent rides, notes | `user.basics`, `user.rider_areas`, `user.hmu_history`, `user.rides`, `user.admin_notes` | Roles with `act.support` |

Phase 2 adds one market builtin:

| Slug | Purpose | Blocks |
|---|---|---|
| `market-supply-demand` | Where supply meets (or misses) demand in this market | `market.driver_supply_by_area`, `market.rider_demand_by_area`, `market.unmatched_demand` |

### Builtin lifecycle rules
- Seeded once on first deploy; subsequent deploys reconcile (insert if missing, update label/description/blocks if drifted, never delete).
- Cannot be deleted via the builder UI (`is_builtin = true`).
- Blocks can be re-ordered or extended via clone — UI offers a "Clone & customize" button on each builtin.
- Grants on the builtin row itself reflect the defaults above; cloned copies start with no grants and require superadmin to assign.
