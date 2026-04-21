# Pricing & Promotions — Resume

Companion doc to `docs/PRICING-PROMOTIONS-PHASES.md`. This one captures **current state** and a **ready-to-paste prompt** for the next session.

Snapshot taken: 2026-04-18, after the driver-activation ship.

---

## Current state

### Phase 1 — Schema ✅ DONE
Migration already applied to Neon (`still-rain-53751745`). Tables live:
`public_offers`, `promotions`, `driver_coupons`, `coupon_redemptions`, `signup_pricing_snapshots`, plus `pricing_config.market_id` column.

RBAC permission strings seeded on `content_manager` and `finance` roles. Types exported in `lib/db/types.ts`.

Migration file kept at `lib/db/migrations/pricing-promotions.sql` for future-branch replays. **Do not re-apply** on the production branch — it's already there.

### Phase 2 — Tier-card sync + Public Offer tab 🟡 CODE WRITTEN, NOT COMMITTED

All 6 files for Phase 2 exist in the working tree, uncommitted:

| File | Status | Lines |
|---|---|---|
| `lib/cms/tier-card-resolver.ts` | new | 168 |
| `app/api/admin/public-offers/route.ts` | new | 133 |
| `app/api/admin/public-offers/[id]/route.ts` | new | 83 |
| `app/admin/pricing/public-offers-client.tsx` | new | 423 |
| `app/admin/pricing/pricing-preview-client.tsx` | new | 86 |
| `app/admin/pricing/pricing-tabs.tsx` | new | 39 |
| `app/admin/pricing/page.tsx` | modified — wrapped in tabs | +26/-3 |
| `lib/cms/queries.ts` | modified — calls resolver | +7/-1 |
| `app/(marketing)/driver/driver-landing-client.tsx` | modified — renders strikethrough + offerLabel | +131/-35 |

**Not yet verified manually.** See checklist below.

### Phase 3 — Promotions CRUD 🔴 NOT STARTED
No files exist.

### Phase 4 — Fee calculator + signup integration 🔴 NOT STARTED
No files exist. **High-risk area** — touches `lib/payments/escrow.ts` and Clerk webhook.

### Phase 5 — Dashboard + drilldown 🔴 NOT STARTED
No files exist.

### Phase 6 — RBAC wiring 🔴 NOT STARTED
`/admin/pricing/page.tsx` still uses `is_admin` check, not `hasPermission('grow.pricing.view')`.

---

## Phase 2 verification checklist (before committing)

Run these manually against a local `npm run dev` before committing. Each one isolates a different failure mode.

1. **No-offer baseline** — hit `/driver` with no `utm_funnel`, confirm the Free and HMU First tier cards render exactly as they do in production today (no strikethrough, no offer label).
2. **Create offer** — visit `/admin/pricing` → "Public Offer" tab → create an offer for `tier=free`, `funnel_stage=awareness`, before=$0, after=$0, label="Free forever", active=true.
3. **Offer shows** — visit `/driver?utm_funnel=awareness`, confirm strikethrough renders with the label. Verify by viewing the source / DOM that the data came from `tier_free.offerLabel` and not hardcoded.
4. **Toggle off** — flip the offer `is_active=false`, reload `/driver?utm_funnel=awareness`, confirm strikethrough disappears. Then toggle on again and confirm it comes back.
5. **Market scoping** — NULL `market_id` should apply to all markets. Confirm this matches the spec in `PRICING-PROMOTIONS-PHASES.md` section "Decisions".
6. **Resolver failure** — temporarily break `resolveTierCardExtras` (e.g. `throw new Error('test')`), confirm `/driver` still renders (try/catch in `queries.ts` catches and returns defaults). Revert the break.
7. **Cache** — open `lib/cms/tier-card-resolver.ts` and confirm there's a 60s in-memory cache keyed by `(marketSlug, funnelStage)`. Plan specifies this. If absent, add it before shipping — every page view otherwise hits the DB twice.
8. **Preview tab** — confirm `/admin/pricing` → "Preview" tab renders the tier cards as a driver/rider would see them for a selected funnel stage.

Once 1–8 pass, stage and commit. Deploy via the standard worker path (see `CLAUDE.md`):
```
npm run build && npx opennextjs-cloudflare build && npx wrangler deploy --config wrangler.worker.jsonc
```

---

## Hard constraints that must survive all remaining phases

From `docs/PRICING-PROMOTIONS-PHASES.md` — repeating here so resume sessions do not re-derive:

- **Do not modify `lib/db/enrollment-offers.ts`** or its consumers (`lib/payments/escrow.ts`, `app/api/rides/[id]/end/route.ts`, `app/api/driver/onboarding/route.ts`, `app/api/driver/earnings-audit/route.ts`, `app/api/driver/enrollment/route.ts`). The launch-offer system is feature-flagged off (`LAUNCH_OFFER_ENABLED = false`) but must keep working if re-enabled. Deprecation is a post-Phase-6 concern.
- **Coupon path runs first** in `captureRiderPayment`; if no coupon applies, the legacy `isDriverInFreeWindow` branch runs unchanged.
- **Global cap decrement must be atomic** — `UPDATE promotions SET global_redemptions_used = global_redemptions_used + 1 WHERE id = ? AND (global_redemption_cap IS NULL OR global_redemptions_used < global_redemption_cap) RETURNING id`. If 0 rows returned, cap is hit — do not issue.
- **At most one active `auto_apply_on_signup` promotion per market** — partial unique index enforces this; the app POST handler must also validate.
- **Validate `benefit_config` shape against `promo_type`** — `free_rides: { rides: N }`, `percent_off_fees: { percent: X, days?: Y, rides?: Z }`, `free_hmu_first: { months: N }`.
- **Stacking coupons is not supported.** Precedence order: `free_hmu_first` > `free_rides` > `percent_off_fees`. Documented in a constant inside `lib/payments/coupons.ts`.
- **Permissions hierarchical**: view < edit < publish. `hasPermission()` in `lib/admin/helpers.ts` handles the implication. `is_super` bypasses.
- **Redemption writes must be in the same transaction as the capture-side ride update.** Use `sql.begin` or the existing ledger insertion pattern.
- **Signup snapshot/coupon logic must never fail signup.** Wrap in try/catch inside the Clerk `user.created` webhook.

---

## Prompt for the next session

Copy-paste this block to a fresh Claude session when you're ready to continue:

---

> **Task — continue the Pricing & Promotions initiative in HMU ATL.**
>
> The full plan lives at `docs/PRICING-PROMOTIONS-PHASES.md`. The current-state snapshot is at `docs/PRICING-PROMOTIONS-RESUME.md`. Read both before doing anything — they contain locked decisions, the mental model (base pricing vs public offer vs promotion), and hard constraints you must respect.
>
> **Where things stand:**
> - Phase 1 (schema) is applied to Neon `still-rain-53751745`. Do not re-run the pricing-promotions migration.
> - Phase 2 (tier-card sync + public offer tab) has code written but uncommitted in the working tree. A verification checklist is in `PRICING-PROMOTIONS-RESUME.md`. Run through it before committing. If the 60s in-memory cache in `lib/cms/tier-card-resolver.ts` is missing, add it.
> - Phases 3–6 have not been started.
> - The driver-activation initiative (feature flag `driver_playbook`, shipped `defe2ee..3e59586`) is unrelated but lives alongside in the repo. Don't touch its files.
>
> **What I want you to do (pick one, ask if unclear):**
>
> 1. Ship Phase 2: run the verification checklist, fix anything broken, commit and deploy. Production deploy command is in `CLAUDE.md`'s DEPLOYMENT section — use the `hmu-atl` Worker, not Pages.
> 2. Build Phase 3 (Promotions CRUD): admin list/detail pages, API routes (GET/POST/PATCH/DELETE + assign), `lib/db/promotions.ts` helpers. Files and acceptance criteria in `PRICING-PROMOTIONS-PHASES.md` "Phase 3". No money logic yet — promotions exist as records only.
> 3. Build Phase 4 (fee calculator + signup integration). **High-risk.** Read the Phase 4 section of the plan and all hard constraints in `PRICING-PROMOTIONS-RESUME.md` first. Coupon path runs before the legacy `isDriverInFreeWindow` branch in `captureRiderPayment`. Never delete or weaken the legacy branch. Global cap decrement must be atomic.
> 4. Build Phase 5 (analytics dashboard + per-driver drilldown). Depends on Phase 4 data.
> 5. Build Phase 6 (RBAC wiring across existing pricing + new promotions routes). Replace `is_admin` checks with `requireAdmin()` + `hasPermission()`. `logAdminAction` on every mutation.
>
> **Constraints — absolutely do not violate:**
> - Don't touch `lib/db/enrollment-offers.ts` or its consumers. `LAUNCH_OFFER_ENABLED` is off but must keep working if re-enabled.
> - Deploy to the `hmu-atl` Worker via `npx wrangler deploy --config wrangler.worker.jsonc`, never to the Pages project.
> - Neon schema writes must go through the Neon MCP (prepare → verify → complete). Do not `psql` directly.
> - Don't commit or reference the unrelated Remotion video prop changes (`videos/props/"book from.json"`, `videos/props/hmulinkbook.json`, and the modified `BookFromHMULink.json` / `compositions.json`) unless I ask.
> - Commit and push only the pricing-promotions paths.
>
> Before writing any code, confirm which phase you're starting on and tell me what you'll verify before shipping.

---

## Files to ignore during resume

If you pick up Phases 2–6 and the tree still has these uncommitted, leave them alone unless explicitly told:

- `videos/props/BookFromHMULink.json` (modified)
- `videos/src/compositions.json` (modified)
- `videos/props/"book from.json"` (untracked)
- `videos/props/hmulinkbook.json` (untracked)
- `.claude/` (project-local settings, should be gitignored)

---

## Known open questions (unresolved)

From the plan's "Open questions parked for later":

- Scheduled publish for public offers (auto-expire via cron)? Not in Phase 2. Admin manually toggles.
- In-app/SMS notification when coupon auto-issued at signup? Deferred.
- Market scoping: when market #2 launches, add `market_id` backfill + middleware. Out of scope for phases 1–6.
- Stacking multiple coupons on one ride — **not supported**. Precedence documented in `lib/payments/coupons.ts` when Phase 4 ships.
