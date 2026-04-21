# Driver Pricing & Promotions — Phase Plan

Phase 1 (schema + types) has shipped. This doc tracks the remaining phases so
work can be resumed cleanly without re-deriving context.

## Decisions (locked with founder)

1. **Promo codes**: shared codes with a global N-use cap, first-come-first-serve
   across all drivers. Codes are optional on a promotion (auto-assignment also
   supported).
2. **Market-ready, not scoped yet**: every new table and `pricing_config` has a
   nullable `market_id`. NULL = applies to all markets. When market #2 launches
   we flip writes to non-null — no migration required.
3. **Permissions**: separate, hierarchical (view/edit/publish):
   - `grow.pricing.*`
   - `grow.promotions.*`
4. **Auto-issue on signup**: if a driver signs up while a public offer is live
   and that offer is linked to a promotion flagged `auto_apply_on_signup`, a
   coupon is auto-issued. Coupons carry their own per-driver use cap (e.g. "3
   free rides"). Global promotion cap is decremented atomically at issuance.

## Mental model (do not lose this)

Three concepts — keep them distinct:

| Concept | Where managed | What it controls |
|---|---|---|
| **Base pricing** | `pricing_config` table, `/admin/pricing` | Actual fee rates/caps applied to every ride |
| **Public offer** | `public_offers` table, `/admin/pricing` → Public Offer tab | Strike-through display on marketing pages (display-only) |
| **Promotion / driver coupon** | `promotions` + `driver_coupons`, `/admin/promotions` | Real fee overrides applied to specific drivers' rides |

The three join at signup: a driver who converts from a public offer is
auto-issued a coupon from the promotion it's linked to. The breadcrumb lives in
`signup_pricing_snapshots`.

## Coexistence with legacy enrollment offer system

Do **not** modify `lib/db/enrollment-offers.ts` or its consumers
(`lib/payments/escrow.ts`, `app/api/rides/[id]/end/route.ts`,
`app/api/driver/onboarding/route.ts`, `app/api/driver/earnings-audit/route.ts`,
`app/api/driver/enrollment/route.ts`). The launch-offer system is feature-flagged
off (`LAUNCH_OFFER_ENABLED = false`) and must keep working if re-enabled.

The new coupon path runs **first** in `captureRiderPayment`; if no coupon
applies, the legacy `isDriverInFreeWindow` check runs unchanged. A later
(post-Phase-6) deprecation will backfill enrollment data into promotions and
remove the legacy tables.

---

## Phase 2 — Tier-card sync + Public Offer tab

**Goal**: marketing tier cards on `/driver` pull from `pricing_config` + active
`public_offers`, not from hardcoded CMS text. Admin can run strike-through
promotions with zero dev involvement.

**Files to add**:
- `lib/cms/tier-card-resolver.ts` — server-side; resolves `{{basePrice}}`,
  `{{feeRate}}`, `{{dailyCap}}`, `{{weeklyCap}}`, `{{strikethroughBefore}}`,
  `{{strikethroughAfter}}`, `{{offerLabel}}` for a given (tier, market,
  funnel_stage). 60s in-memory cache, same pattern as `fee-calculator.ts`.
- `app/api/admin/public-offers/route.ts` — GET (list), POST (create).
- `app/api/admin/public-offers/[id]/route.ts` — PATCH (edit, toggle active),
  DELETE.
- `app/admin/pricing/public-offer-client.tsx` — matrix editor (tier × funnel
  stage), before/after/label inputs, active toggle, effective dates.
- `app/admin/pricing/pricing-preview-client.tsx` — renders the tier cards as
  drivers/riders would see them for a selected funnel stage.

**Files to modify (carefully — do not break existing tier card render)**:
- `lib/cms/zone-registry.ts` — `tier_free` and `tier_hmu_first` zones keep
  their copy fields (headline, features, CTAs). Add optional template-variable
  support in the renderer so prices resolve dynamically. If a variable is not
  present, fall back to the current hardcoded string so nothing breaks if the
  admin hasn't set anything yet.
- `app/admin/pricing/page.tsx` — wrap existing `PricingConfigClient` +
  `HoldPolicyClient` in a tabs container and add `PublicOfferClient` and
  `PricingPreviewClient` as additional tabs.
- Driver landing page (`app/(marketing)/driver/driver-landing-client.tsx` and
  its zone renderer) — call resolver when rendering `tier_free` /
  `tier_hmu_first` zones.

**Risks to avoid**:
- Do not delete or rename fields on the existing tier zones — other CMS
  consumers may read them. Additive only.
- Resolver must never throw on missing config — fall back to DEFAULTS in
  `fee-calculator.ts`.
- Do not run SQL at render time on every page load. Cache + TTL.

**Definition of done**:
- Admin can set `tier_free` public offer at `awareness` stage: before=$0,
  after=$0, label="Free forever". Visiting `/driver?utm_funnel=awareness`
  renders the tier card with that label.
- Removing a public offer makes the strike-through disappear without touching
  base pricing.
- Existing `/driver` landing renders identically to today if no public offer
  is active.

---

## Phase 3 — Promotions CRUD

**Goal**: ops can define, list, edit, and deactivate promotions. Promotions
exist as records but do not yet affect fees.

**Files to add**:
- `app/admin/promotions/page.tsx` — list + top-strip dashboard.
- `app/admin/promotions/promotions-panel.tsx` — table, filters, create button.
- `app/admin/promotions/[id]/page.tsx` + `edit-promotion-client.tsx` — edit form.
  One promo type at a time via radio; reveals the relevant benefit/eligibility
  inputs.
- `app/api/admin/promotions/route.ts` — GET, POST.
- `app/api/admin/promotions/[id]/route.ts` — GET, PATCH, DELETE (soft — flip
  `is_active=false`, never hard delete if redemptions exist).
- `lib/db/promotions.ts` — typed DB helpers (`listPromotions`,
  `createPromotion`, `updatePromotion`, `getPromotion`, etc.).
- `app/api/admin/promotions/[id]/assign/route.ts` — POST { driverId } to
  manually assign.

**Risks to avoid**:
- Enforce at-most-one active `auto_apply_on_signup` per market in the POST
  handler (backs up the partial unique index).
- Validate `benefit_config` shape against `promo_type`.
- Permissions: `grow.promotions.view` to GET, `grow.promotions.edit` to
  create/PATCH, `grow.promotions.publish` to flip `is_active=true`.

**Definition of done**:
- Admin can create a promotion with code `ATL50`, type `percent_off_fees`,
  benefit `{ percent: 50, days: 14 }`, cap 100 redemptions.
- Admin can deactivate a promo; it stops showing as active but history is kept.
- Admin can manually assign a driver to a promotion from the promo detail page.

---

## Phase 4 — Fee calculator + signup integration

**Goal**: coupons actually save drivers money, and new signups auto-claim from
linked public offers.

**Files to add**:
- `lib/payments/coupons.ts`:
  - `getActiveCouponForDriver(driverId)` — returns highest-precedence active
    coupon or null. Precedence: `free_hmu_first` > `free_rides` > `percent_off_fees`.
  - `applyCouponToFee(coupon, tier, baseFee, ride context)` — returns
    `{ finalFee, waivedFee, tierOverride }`.
  - `recordRedemption({ couponId, rideId, feeWaivedCents, feeWouldHaveBeenCents, feeChargedCents })`
    — writes `coupon_redemptions` row, decrements `uses_remaining`, flips
    `status='exhausted'` atomically.
- `lib/payments/signup-pricing.ts`:
  - `captureSignupSnapshot(userId, { funnelStage, market })` — writes
    `signup_pricing_snapshots`.
  - `autoIssueCouponIfEligible(userId, { funnelStage, market })` —
    atomically: looks up active public offer with linked promotion flagged
    `auto_apply_on_signup`; if found and global cap not hit, increments
    counter and inserts `driver_coupons` row.
- `app/api/driver/redeem-code/route.ts` — POST { code }; rate-limited via
  Upstash. Atomic global counter increment.

**Files to modify**:
- `lib/payments/escrow.ts::captureRiderPayment` — add a coupon check before
  the existing `isDriverInFreeWindow` branch:
  ```
  const coupon = await getActiveCouponForDriver(driverId);
  if (coupon) {
    // apply coupon, record redemption, skip legacy path
  } else if (inFreeWindow) {
    // existing legacy branch unchanged
  } else {
    // normal fee
  }
  ```
  Never remove the legacy branch. Coupon application replaces `actualFee` and
  writes ledger entry `fee_waived_coupon`.
- `app/api/webhooks/clerk/route.ts` — after `createUser()` on user creation
  path (around line 102–127), call `captureSignupSnapshot` then
  `autoIssueCouponIfEligible`. Both inside a try/catch — signup must not fail
  if snapshot/coupon logic fails.

**Risks to avoid**:
- Coupon ordering is deterministic and documented in a constant.
- Global cap decrement must be atomic (`UPDATE ... SET
  global_redemptions_used = global_redemptions_used + 1 WHERE ... AND
  (global_redemption_cap IS NULL OR global_redemptions_used <
  global_redemption_cap) RETURNING id`). If the update returns 0 rows, the
  code is exhausted — do not issue the coupon.
- Legacy `driver_enrollment_offers` must still function when
  `LAUNCH_OFFER_ENABLED = true`.
- Redemption write must be in the same transaction as the capture-side ride
  update. Use `sql.begin` or the existing ledger insertion pattern.

**Definition of done**:
- Test driver with a `percent_off_fees` 50% coupon: a $20 ride shows waived
  fee = $0.80 (half of $1.60), redemption row exists.
- Test driver with a `free_rides` N=3 coupon: 3 consecutive rides have fee=$0,
  4th ride has normal fee, coupon status='exhausted'.
- Test driver with `free_hmu_first` 3-month coupon: fee uses hmu_first tier
  config even if `users.tier = 'free'`.
- Webhook signup with active auto-apply promo: `signup_pricing_snapshots`
  row + `driver_coupons` row both exist; global counter is `n+1`.
- Legacy enrollment path still functions when re-enabled (regression test).

---

## Phase 5 — Dashboard + per-driver drilldown

**Goal**: visibility. Without this, promotions leak money silently.

**Files to add**:
- `app/admin/promotions/dashboard-strip.tsx` — active promos count, total
  fees waived (week/month), projected monthly cost, top redeemed promo.
- `app/admin/users/[id]/promotions-section.tsx` (or wherever the user
  drilldown lives — verify path at phase start) — list active/past coupons,
  assign button, redemption ledger table.
- `app/api/admin/users/[id]/coupons/route.ts` — GET (list), POST (assign).
- `lib/db/coupon-analytics.ts` — `getPromotionStats(promotionId)`,
  `getDashboardMetrics()`.

**Files to modify**:
- `app/admin/users/[id]/*` — embed `PromotionsSection`. Do not rework the
  existing user drilldown layout.

**Definition of done**:
- Promotions list page shows live `redemptions_used / global_cap` and
  `total fees waived` per promo.
- User drilldown shows all coupons this driver has, with uses_remaining and
  expiry.
- Admin can revoke a coupon from the drilldown (soft: `status='revoked'`,
  `revoked_by`, `revoke_reason`).

---

## Phase 6 — RBAC wiring

**Goal**: enforce the permissions the migration defined.

**Files to modify**:
- `app/admin/pricing/page.tsx` — replace `is_admin` check with
  `requireAdmin()` + `hasPermission(admin, 'grow.pricing.view')`. Same
  guard-and-redirect pattern used elsewhere in `/admin`.
- `app/admin/promotions/page.tsx` — require `grow.promotions.view`.
- All POST/PATCH/DELETE handlers under `/api/admin/pricing/*`,
  `/api/admin/public-offers/*`, `/api/admin/promotions/*` — require
  `grow.pricing.edit` or `grow.promotions.edit`.
- Toggling `is_active` on a public offer or promotion — require `publish`.
- Existing `pricing_config` POST handler — add `grow.pricing.edit` requirement
  (currently only checks `is_admin`).

**Risks to avoid**:
- Do not break existing workflows for super admins. `is_super` short-circuits
  `hasPermission`, so the super-admin experience should be unchanged.
- Check every mutation, not just reads.
- `logAdminAction` every state-changing call.

**Definition of done**:
- Non-super admin without `grow.pricing.*` permissions cannot load
  `/admin/pricing` or mutate pricing config.
- Content manager role (which the migration granted `grow.promotions.edit`)
  can create promos but not activate them (publish requirement).
- Audit log entries exist for every promotion create/update/activate and
  every public offer change.

---

## Build-order rules

- Phases 2 and 3 are parallelizable after Phase 1.
- Phase 4 requires both 2 and 3.
- Phases 5 and 6 require 4.
- Schema migration (`lib/db/migrations/pricing-promotions.sql`) must be run in
  Neon before any subsequent phase can function. Deploy command for Cloudflare
  stays the same; no worker config change.

## Open questions parked for later

- Should public offers support scheduled publish (publish at X, auto-expire at
  Y) via a cron? For Phase 2 we do manual toggle + `effective_from` /
  `effective_to` is informational only.
- Should drivers get an in-app/SMS notification when a coupon is auto-issued
  at signup? Deferred.
- Market scoping: when we launch market #2, add `market_id` backfill + middleware
  to set current market from subdomain/header. Out of scope for phases 1–6.
- Stacking multiple coupons on one ride is not supported. Precedence order is
  documented in `lib/payments/coupons.ts`.
