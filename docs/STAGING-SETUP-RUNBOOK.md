# Staging Setup Runbook

> Walks you from "no staging" to a fully verified `staging.hmucashride.com` mirror of prod.
> Phase A is a 10-minute Worker bootstrap. Phase B is the full setup (~45–60 min, mostly clicks in dashboards).

---

## Why this ordering matters (read first)

The 2026-05-06 incident: the first staging Worker deploy exposed production credentials because `opennextjs-cloudflare` **bakes `.env.local` values into the worker bundle** as a `process.env` runtime fallback (in `.open-next/cloudflare/next-env.mjs`). The staging Worker had no `wrangler secret` overrides yet, so the baked prod values became its runtime config — and a public `*.workers.dev` URL was a live ingress to the prod database for ~30 minutes.

Two rules came out of that:

1. **`.env.local` must never contain real secrets.** Treat it as dev-tier only. Secrets live exclusively in `wrangler secret put` per Worker.
2. **Every new Worker** (staging, preview, future cells) **must have its secrets set via `wrangler secret bulk` before its first user-facing deploy** — or the bundle's baked fallback wins at runtime.

This runbook enforces both. **Don't skip Phase A0.**

---

## What this gets you

A second Cloudflare Worker named `hmu-atl-staging` running the same code as prod, with isolated:

- Cloudflare R2 buckets (`hmu-atl-staging-*`)
- Neon Postgres branch (`staging`)
- Clerk app (separate publishable + secret keys, separate user pool)
- Stripe **test mode** keys (no real money moves)
- PostHog project (so staging events don't pollute prod analytics)

Production is **not touched** by this runbook. Worst case: staging breaks; prod keeps serving.

---

## Pre-flight

You need access to:

- Cloudflare dashboard (Workers, R2, DNS)
- Neon dashboard
- Stripe dashboard (test mode)
- Clerk dashboard
- PostHog dashboard
- Upstash dashboard
- Local `wrangler` authenticated (`wrangler whoami` works)
- This repo at `main`, on the host you deploy from

---

## Phase A — Sanitize, bootstrap Worker (10 min, no real services yet)

### A0. Verify `.env.local` is sanitized (HARD GATE)

Any non-`NEXT_PUBLIC_*` secret in `.env.local` will be baked into the deployed bundle. Confirm they're all placeholders before going further.

```bash
# Should return ONLY lines that start with NEXT_PUBLIC_ or are price/account IDs
grep -v -E '^(#|$|NEXT_PUBLIC_|.*_PRICE_ID=|STRIPE_PLATFORM_ACCOUNT_ID=|META_DATASET_ID=|NODE_ENV=|STRIPE_MOCK=)' .env.local
```

Every line that prints must be an *obvious* placeholder. Acceptable patterns:

- `=REPLACE_ME` (string-typed secrets like webhook signing keys)
- `=sk_test_REPLACE_ME` / `=whsec_REPLACE_ME` (prefixed placeholders for Stripe shape)
- `postgresql://placeholder:placeholder@127.0.0.1:5432/...` (parseable but unreachable URL — required because `lib/db/client.ts` calls `neon()` at module load during `next build` and a non-URL string throws)

If you see anything that looks like a real secret (`sk_live_`, a `postgresql://` URL pointing at a real host, a `whsec_` with real-looking entropy), **stop**, sanitize the file, and re-run the check.

NEXT_PUBLIC_* values, Stripe `pk_*` publishable keys, `acct_*`/`price_*` IDs, and Mapbox public tokens are safe to keep — they ship to the browser anyway.

### A1. Create the two R2 buckets

Cloudflare dashboard → **R2 Object Storage** → Create bucket. Default settings, default jurisdiction. Names must match exactly:

- `hmu-atl-staging-opennext-cache`
- `hmu-atl-staging-media`

### A2. First (skeleton) deploy

```bash
npm run deploy:staging
```

This builds OpenNext output and creates the `hmu-atl-staging` Worker. With A0 verified, the bundle bakes `REPLACE_ME` for every secret — harmless. The Worker boots but cannot connect to any real service yet. That's correct.

Wrangler prints the URL — looks like:

```
https://hmu-atl-staging.<your-account-subdomain>.workers.dev
```

`wrangler whoami` shows the account subdomain if you don't remember it.

### A3. Skeleton smoke test

```bash
curl -i "https://hmu-atl-staging.<your-account-subdomain>.workers.dev/api/health"
```

Expected: HTTP 503, body has `{"ok":false,"db":{"ok":false,"latencyMs":null}, ...}` — DB unreachable because no `DATABASE_URL` secret yet. **Phase A done.** Move to Phase B to bring the Worker to life.

If you got HTML or a Cloudflare error page instead, see **Troubleshooting** below before continuing.

---

## Phase B — Provision services, set secrets, redeploy

### B1. Neon staging branch

Neon dashboard → your project → **Branches** → **Create branch**.

- **From**: `main` (or whatever your prod branch is named in Neon)
- **Name**: `staging`
- This copies schema + a snapshot of data. Free, isolated, can be reset later.

After creation, click into the `staging` branch → **Connection details**:

- Pooled URL → save as `DATABASE_URL`
- Direct URL → save as `DATABASE_URL_UNPOOLED`

### B2. Stripe test mode setup

Stripe dashboard → toggle **Test mode** (top right).

Grab keys from **Developers → API keys**:

- `STRIPE_SECRET_KEY` (`sk_test_...`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_...`)

Create a test webhook endpoint:

1. **Developers → Webhooks → Add endpoint**
2. URL (provisional, you'll update after B7 if you set up the custom domain): `https://hmu-atl-staging.<account>.workers.dev/api/webhooks/stripe`
3. Events to select — match prod webhook exactly:
   - `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
   - `account.updated`, `transfer.created`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `invoice.payment_succeeded`, `invoice.payment_failed`
   - `charge.refunded`, `charge.dispute.created`
   - `payout.paid`, `payout.failed`, `balance.available`
4. Reveal signing secret → save as `STRIPE_WEBHOOK_SECRET` (`whsec_test_...`)

Create a test-mode HMU First product:

1. **Products → Add product** → "HMU First (staging)" — recurring monthly $9.99
2. Copy the price ID → save as `HMU_FIRST_PRICE_ID`

### B3. Clerk staging app

Clerk's publishable key is bound to a domain, so staging needs its own application.

1. Clerk dashboard → **Create application** → name "HMU Staging"
2. Authentication methods: match prod (phone OTP via Twilio Verify, email)
3. From the **API Keys** page, copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
4. Frontend API host (top of dashboard): note the value. Either:
   - Clerk's auto-provided host (e.g. `<random>.clerk.accounts.dev`) — works on `*.workers.dev` URLs
   - Or `clerk.staging.hmucashride.com` if you'll use the custom domain in B7
5. Save the chosen value as `NEXT_PUBLIC_CLERK_DOMAIN`
6. Create a webhook (Webhooks → Add endpoint):
   - URL: `<staging URL>/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`, `session.created`
   - Save signing secret as `CLERK_WEBHOOK_SECRET`

### B4. PostHog (separate from prod)

- **PostHog**: Create a new project named "HMU Staging". Copy `NEXT_PUBLIC_POSTHOG_KEY`. Staging events corrupt prod funnels otherwise.

### B4a. Services intentionally NOT provisioned for staging

- **Twilio** — codebase has zero Twilio references. CLAUDE.md mentions it; that's stale. Skip.
- **Upstash Redis** — listed as the rate-limiting layer in CLAUDE.md, but never wired up in prod either. Skip until rate limiting is actually built.
- **VoIP.ms (SMS)** — `lib/sms/textbee.ts` (legacy filename, voip.ms contents) auto-skips sends when `VOIPMS_API_USERNAME` / `VOIPMS_API_PASSWORD` are unset, logging to `sms_log.status = 'skipped'`. Don't set VoIP secrets on staging — SMS sends will no-op cleanly, no real phones get pinged.
- **Stripe Connect onboarding** — uses Stripe Test Mode keys from B2; no separate provisioning.

### B5. Bulk-set staging secrets

This is the step the leak incident reshaped. Don't run `wrangler secret put` 22 times. Use the bulk script — it lives in `scripts/set-staging-secrets.sh` and mirrors the prod rotation script.

```bash
# 1. Generate the template
./scripts/set-staging-secrets.sh template > .dev.vars.staging.tmp

# 2. Open .dev.vars.staging.tmp in your editor and paste real values
#    over each REPLACE_ME using what you collected in B1–B4.

# 3. Run the script — pushes all secrets to hmu-atl-staging,
#    then auto-deletes the temp file (even on Ctrl-C).
./scripts/set-staging-secrets.sh
```

The script:
- Refuses to run if any uncommented `REPLACE_ME` remains (guards against shipping the literal string as a secret)
- Auto-deletes `.dev.vars.staging.tmp` on exit via `trap` (so the file can't survive past the run)
- The temp file is gitignored regardless

### B6. Re-deploy with secrets in place

```bash
npm run deploy:staging
```

Then re-run the smoke test — should now return 200 with `db.ok: true`:

```bash
curl "https://hmu-atl-staging.<account>.workers.dev/api/health"
# {"ok":true,"db":{"ok":true,"latencyMs":42},...}
```

(Strictly, Worker secrets layer at runtime so a redeploy isn't required to pick them up — but redeploying now ensures the bundle on disk also reflects A0's sanitized state, no surprises.)

### B7. Custom domain — `staging.hmucashride.com`

1. Cloudflare dashboard → **Workers & Pages** → `hmu-atl-staging` → **Settings → Domains & Routes** → **Add Custom Domain**
2. Enter `staging.hmucashride.com`
3. Cloudflare auto-creates the DNS CNAME and provisions SSL (1–3 min)
4. Update `wrangler.staging.jsonc` — uncomment the routes block:
   ```jsonc
   "routes": [
     { "pattern": "staging.hmucashride.com", "custom_domain": true }
   ]
   ```
5. Re-deploy: `npm run deploy:staging`
6. Update Stripe + Clerk webhook URLs (B2 step 2, B3 step 6) to use `https://staging.hmucashride.com/api/webhooks/...`
7. If you used the custom Clerk domain (`clerk.staging.hmucashride.com`), set up DNS for it too — Clerk dashboard shows the exact CNAME

---

## Verification (the "does it work" checklist)

```bash
# 1. Worker boots
curl -i https://staging.hmucashride.com/api/health
# Expect: 200, body has ok:true, db.ok:true

# 2. Public marketing pages render
curl -I https://staging.hmucashride.com/
# Expect: 200, content-type text/html

# 3. Auth redirect works
curl -I https://staging.hmucashride.com/driver/home
# Expect: 307/302 redirect to /sign-in
```

Browser checklist (5 min):

1. Open `https://staging.hmucashride.com/`
2. Sign up as a rider (use the Clerk staging app)
3. Add Stripe test card `4242 4242 4242 4242` → exp any future date → CVC any 3 digits
4. Browse `/rider/browse`, send a test booking
5. Check Stripe **test mode** dashboard — see the PaymentIntent
6. Check PostHog **staging project** — see the event

If any step fails, check `wrangler tail hmu-atl-staging --config wrangler.staging.jsonc` for live logs.

---

## Day-2 ops

```bash
# Tail logs
wrangler tail hmu-atl-staging --config wrangler.staging.jsonc

# List recent deploys
wrangler deployments list --name hmu-atl-staging

# Re-deploy from current branch
npm run deploy:staging

# Update a single secret without re-running the bulk script
wrangler secret put <NAME> --config wrangler.staging.jsonc

# Reset staging DB to mirror prod (Neon dashboard → staging branch → Reset from parent)
```

---

## Cleanup — production hygiene to do once staging is up

These aren't blockers for staging working, but should land in the next session:

1. **Move VoIP creds out of `wrangler.worker.jsonc`** — they're committed in git history as plaintext under the `vars` block. Run:
   ```bash
   wrangler secret put VOIPMS_API_USERNAME --config wrangler.worker.jsonc
   wrangler secret put VOIPMS_API_PASSWORD --config wrangler.worker.jsonc
   wrangler secret put VOIPMS_DID_ATL --config wrangler.worker.jsonc
   ```
   Then delete the `vars` block from `wrangler.worker.jsonc` and re-deploy prod.

2. **Rotate the leaked VoIP password** — anyone with repo read access has it. Generate a new password in voip.ms admin, then set the new value as the secret.

3. **Rotate `ABLY_API_KEY` + `META_CONVERSIONS_API_TOKEN`** — both were in the 2026-05-06 leaked bundle. Use `scripts/rotate-prod-secrets.sh`.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `npm run deploy:staging` fails with "bucket not found" | R2 buckets from A1 weren't created or names don't match |
| `curl /api/health` returns HTML, not JSON | Middleware is redirecting — confirm `/api/health` is in `isPublicRoute` (already done in this PR) |
| `curl /api/health` returns 200 but `db.ok: false` | `DATABASE_URL` secret missing or wrong; `wrangler secret list --config wrangler.staging.jsonc` to verify |
| Skeleton smoke test (A3) returns DB credentials that look like prod | **STOP — the leak pattern is back.** A0 did not actually sanitize `.env.local`. Delete the staging Worker (`wrangler delete --config wrangler.staging.jsonc`), re-sanitize, restart from A0. |
| Sign-up redirects in a loop | Clerk publishable key doesn't match the host the page is loaded from. Verify `NEXT_PUBLIC_CLERK_DOMAIN` matches what Clerk dashboard shows |
| Stripe webhook signature failures | `STRIPE_WEBHOOK_SECRET` is from the wrong endpoint. Each webhook URL has its own signing secret |
| Apex redirect (`hmucashride.com → atl.hmucashride.com`) hits staging | The middleware redirects only the apex hosts. `staging.hmucashride.com` is not in that list, so unaffected |
