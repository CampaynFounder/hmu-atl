# Market Expansion Runbook

> Operational playbook for launching HMU in a new city. Follow top-to-bottom.
> Target time: **~1 hour of technical work** once pilot drivers are lined up.
>
> Source of truth for the "what changes when we add a market" contract. Append
> to the **Lessons Learned** section at the bottom after every launch.

---

## Pre-flight — before touching code

- [ ] **Legal/ops:** confirm the city is in scope (rideshare regulations, insurance coverage)
- [ ] **Pilot driver list:** 3–10 drivers committed to the first week. Get names + phone numbers.
- [ ] **Marketing:** a local Facebook group or WhatsApp thread for rider acquisition (can be empty at cutover; the DID and content go first, promo follows)
- [ ] **DID decision:** purchase a local 3-digit area code DID from VoIP.ms, OR plan to reuse ATL's `404` during pilot (fine for pilot — riders/drivers get SMS from ATL number, documented expectation)
- [ ] **Taxonomy:** list 8–12 neighborhood slugs with cardinal groupings (`westside | eastside | northside | southside | central`). See `markets/nola.json` as template.
- [ ] **OG images:** if brand-differentiated imagery exists, upload to R2. Otherwise the ATL OG image is the default.

---

## Phase 1 — data (15 min)

1. **Copy the template:**
   ```bash
   cp markets/nola.json markets/<slug>.json
   ```

2. **Edit the config** — update slug, name, subdomain, coords, taxonomy. Reference `markets/_schema.json` for field contracts.

3. **Seed the market** (idempotent — safe to re-run):
   ```bash
   npx tsx scripts/seed-market.ts --config markets/<slug>.json --dry-run   # preview
   npx tsx scripts/seed-market.ts --config markets/<slug>.json             # apply
   ```

   This inserts the `markets` row, `market_areas` (specifics + 5 cardinal macros), and clones CMS content from ATL as `status='draft'`.

4. **Spot-check in Neon:**
   ```sql
   SELECT slug, status, center_lat, center_lng FROM markets WHERE slug = '<slug>';
   SELECT COUNT(*) FROM market_areas WHERE market_id = (SELECT id FROM markets WHERE slug = '<slug>');
   SELECT COUNT(*) FROM content_variants WHERE market_id = (SELECT id FROM markets WHERE slug = '<slug>');
   ```

---

## Phase 2 — infra (15 min)

5. **Add subdomain to Cloudflare Worker:** edit `wrangler.worker.jsonc`:
   ```jsonc
   "routes": [
     { "pattern": "atl.hmucashride.com", "custom_domain": true },
     { "pattern": "<slug>.hmucashride.com", "custom_domain": true },  // ← add
     { "pattern": "hmucashride.com/*", "zone_name": "hmucashride.com" }
   ]
   ```

6. **DNS:** in Cloudflare DNS for `hmucashride.com`, add a CNAME record:
   ```
   <slug>.hmucashride.com  →  hmu-atl.<account>.workers.dev
   Proxy: Proxied (orange cloud) OFF if direct-to-worker; on if going through CF cache.
   ```
   Match the existing ATL setup.

7. **Add `KNOWN_MARKET_SUBDOMAINS`** — edit `middleware.ts`:
   ```typescript
   const KNOWN_MARKET_SUBDOMAINS = new Set(['atl', 'nola', '<slug>']);
   ```

8. **Add `getMarketBranding`** entry — edit `lib/markets/branding.ts` with the new market's host/city/cityShort. `ogImage` can reuse ATL until design provides dedicated asset.

9. **Deploy:**
   ```bash
   npm run build && npx opennextjs-cloudflare build && npx wrangler@latest deploy --config wrangler.worker.jsonc
   ```

10. **Smoke test the subdomain:**
    ```bash
    curl -sI https://<slug>.hmucashride.com/driver | head -1   # expect 200
    curl -s  https://<slug>.hmucashride.com/driver | grep -c 'content'
    ```

---

## Phase 3 — Clerk (5 min, only on first-ever root-domain migration)

> Skip this phase for every market AFTER the first root-domain move. Once
> Clerk lives at `clerk.hmucashride.com`, new subdomains inherit auth with zero
> Clerk config.

11. **Run the pre-flight:**
    ```bash
    npx tsx scripts/pre-clerk-migration-check.ts
    ```
    Must print `✅ Zero active rides`. Abort if any rides are `otw | here | active`.

12. **Clerk dashboard:**
    - Dashboard → your instance → **Domains**
    - Add custom domain: `clerk.hmucashride.com`
    - Clerk gives you a CNAME target; add it to Cloudflare DNS (grey cloud / DNS-only, like the existing `clerk.atl.*` record)
    - Wait ~1 min for DNS verification
    - Promote `clerk.hmucashride.com` to **primary** custom domain

13. **Update Worker secret:**
    ```bash
    npx wrangler@latest secret put NEXT_PUBLIC_CLERK_DOMAIN --config wrangler.worker.jsonc
    # paste: clerk.hmucashride.com
    ```

14. **Redeploy** (existing ATL users sign in once; their accounts/data are untouched):
    ```bash
    npm run build && npx opennextjs-cloudflare build && npx wrangler@latest deploy --config wrangler.worker.jsonc
    ```

15. **Smoke test auth:**
    - Open `atl.hmucashride.com` incognito → sign-in works
    - Open `<slug>.hmucashride.com` incognito → sign-in works with the same account

---

## Phase 4 — launch (10 min)

16. **Review CMS drafts:** Admin → Funnel → switch market to `<slug>` → publish variants. At minimum the hero/eyebrow/CTA zones.

17. **Flip status:** Admin → Markets → select `<slug>` → status `setup` → `soft_launch` or `live`. `soft_launch` hides from general marketing but accepts direct signups; `live` exposes publicly.

18. **Seed first driver:** have the first pilot driver sign up at `<slug>.hmucashride.com/sign-up?type=driver`. Verify `users.market_id` was auto-bound:
    ```sql
    SELECT clerk_id, profile_type, market_id FROM users ORDER BY created_at DESC LIMIT 5;
    ```

---

## Contract — what changes per market

| Layer | Per-market | Shared |
|---|---|---|
| `markets` table row | ✓ | — |
| `market_areas` rows | ✓ | Cardinals enum shared |
| CMS `content_variants` | ✓ | `content_zones` shared |
| `personas` | ✓ | — |
| `page_section_layouts` | ✓ | — |
| `pricing_config` | Optional override | Global (NULL market_id) applies by default |
| `users.market_id` | Bound at signup | — |
| `hmu_posts`, `rides`, etc. | Scoped by `market_id` | — |
| Clerk | — | One instance, cookies on `.hmucashride.com` |
| Cloudflare Worker | `<slug>.hmucashride.com` route | Same worker code |
| DID | Per-market env var (`VOIPMS_DID_<SLUG>`) | ATL fallback if unset |

---

## What we **don't** change per market

- Next.js app code (everything is data-driven)
- Stripe setup (single platform account; per-market fee overrides go in `fee_config`)
- Ably keys (channel names are market-scoped: `market:<slug>:feed`)
- Clerk instance (satellite/root handling done once at Phase 3)
- Database schema (all multi-market scaffolding already in place)

---

## Lessons learned

### NOLA launch — 2026-04-20

**What went well:**
- Market-scoping was already done in the 2026-04-18 refactor — seed + subdomain routing was the entire code delta
- `seed-market.ts` script tested end-to-end on NOLA; exit-0 after idempotent re-run confirms no side effects on ATL data
- Taxonomy picked from desk research (12 areas) — will revalidate after pilot drivers weigh in

**Gotchas for next market:**
- Real DB schema ≠ `admin-portal.sql` migration file. Trust `information_schema.columns` over the SQL file when auditing. `markets` table has evolved columns (`subdomain`, `status`, `center_lat/lng`, `sms_did`, `fee_config`, `branding`) that aren't in the checked-in migration. TODO: reconcile the migration history.
- `isInAtlantaMetro()` only has one production caller (`/api/rides/request`) — the shim layer shape worked cleanly. If future geo validation expands, route everything through `isInMarketBounds()`.
- Clerk root-domain migration is a one-time event, not per-market. Plan it for a low-traffic window, guard with `pre-clerk-migration-check.ts`.
- CMS text swap (`'Atlanta' → 'New Orleans'`) is insufficient for `'ATL' → 'N.O.'` because "ATL" appears in substrings. Keep variants as `draft` and review manually; don't trust a bulk sed on CMS content.
- SMS templates hardcode "HMU ATL:" and `atl.hmucashride.com` URLs — not broken for pilot (links still work via root cookie) but visually off-brand for NOLA riders/drivers. Follow-up: make `sendSms()` template builder market-aware.

### Template for next entry

Copy this on the next market launch:

```
### <CITY> launch — <YYYY-MM-DD>

**What went well:**
-

**Gotchas for next market:**
-
```
