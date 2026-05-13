# HMU ATL — CLAUDE.md
> Single source of truth for all agents. Every Claude Code session reads this file automatically.
> Specialized docs in `/docs/` — load as needed.

---

## TABLE OF CONTENTS

### 🚨 P0 — Read Before Any Work
1. [What This App Is](#what-this-app-is) — 30 sec
2. [Tech Stack](#tech-stack-locked--do-not-substitute) — Reference only
3. [Deployment](#deployment-critical--read-before-any-deploy) — **MUST READ before any deploy**

### 📚 Specialized Documentation
- [Schema](./docs/SCHEMA.md) — Database schema, TypeScript types
- [Payments](./docs/PAYMENTS.md) — Stripe integration, capture flow, reversals
- [Ride Flow](./docs/RIDE-FLOW.md) — State machine, UI vocabulary, Start Ride checks
- [Realtime](./docs/REALTIME.md) — Ably channels, GPS tracking rules
- [Monetization](./docs/MONETIZATION.md) — Fee structure, tiers, payouts
- [Fraud Prevention](./docs/FRAUD.md) — Multi-layer security
- [UI Components](./docs/UI-COMPONENTS.md) — 21st.dev registry, design system
- [Agent Build Plan](./docs/AGENT-BUILD-PLAN.md) — Development roadmap, Definition of Done

### 🔧 Quick Reference
4. [Environment Variables](#environment-variables) — Never hardcode keys
5. [Clerk Metadata Schema](#clerk-metadata-schema) — User metadata structure
6. [MCP Tools](#mcp-tools--runtime-api) — Runtime API endpoints

---

## WHAT THIS APP IS

HMU ATL is a **mobile-first PWA** peer-to-peer ride platform for Metro Atlanta.
- **Riders**: Young Atlantans who can't afford Uber/Lyft
- **Drivers**: Local Atlantans earning on their own schedule
- **Language**: Urban Atlanta — HMU, BET, OTW, CHILL, Cool AF, WEIRDO
- **MVP Scope**: Ride flow only. Service bookings and Pickup/Delivery are post-MVP.

---

## TECH STACK (LOCKED — DO NOT SUBSTITUTE)

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) — PWA |
| Styling | Tailwind CSS + Shadcn/UI |
| UI Components | 21st.dev registry (shadcn-based) via `npx shadcn` |
| Auth | Clerk |
| Database | Neon (Serverless Postgres) |
| Realtime | Ably |
| Payments | Stripe Connect |
| Maps | Mapbox GL JS + Turf.js |
| Hosting | Cloudflare Pages + Workers |
| SMS | Twilio (Verify + SMS) |
| AI/NLP | OpenAI GPT-4o-mini |
| Rate Limiting | Upstash Redis |
| Analytics | PostHog |
| Error Tracking | Sentry |

---

## DEPLOYMENT (CRITICAL — READ BEFORE ANY DEPLOY)

> **Production is served by the `hmu-atl` Cloudflare Worker, NOT Cloudflare Pages.**
> The custom domains `atl.hmucashride.com` and `nola.hmucashride.com` route to this worker (plus `hmucashride.com/*`).
> Deploying to the wrong target causes **Clerk handshake errors** because Clerk is configured for `atl.hmucashride.com` only.

### 🚨 MANDATORY GIT WORKFLOW — NEVER DEPLOY WITHOUT PR

**RULE: Every production deploy MUST go through a GitHub PR. No exceptions.**

Deploying directly with `wrangler deploy` bypasses code review and breaks git history sync. Always follow this workflow:

### Step-by-Step Deployment Process

**1. Create feature branch**
```bash
git checkout -b feat/your-feature-name
```

**2. Make your changes and commit**
```bash
git add -A
git commit -m "feat: your feature description

Detailed explanation of changes...

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**3. Push branch to GitHub**
```bash
git push -u origin feat/your-feature-name
```

**4. Create Pull Request**
```bash
gh pr create --title "feat: your feature" --body "## Summary\n\nYour PR description" --base main
```

**5. Review & Approve PR**
- Review changes on GitHub
- Run tests if applicable
- Approve and merge to `main`

**6. Pull latest main**
```bash
git checkout main
git pull origin main
```

**7. Deploy to production**
```bash
npm run build && npx opennextjs-cloudflare build && npx wrangler deploy --config wrangler.worker.jsonc
```
Or use the npm shortcut:
```bash
npm run deploy:worker
```

**8. Verify deployment shipped**
```bash
npx wrangler deployments list --name hmu-atl | head -5
```
Check that the timestamp matches your deploy time.

### Rollback Procedure

If a deploy breaks production:

```bash
# List recent deployments
npx wrangler deployments list --name hmu-atl | head -20

# Rollback to previous version
npx wrangler rollback --name hmu-atl --message "Rollback reason"
```

Wrangler will prompt you to select the version to roll back to.

### Deploys are MANUAL — `git push` does nothing on its own
There is no CI/CD auto-deploy. Pushing to `origin/main` does not ship code to prod. You must run the deploy command yourself after merging the PR.

### What each piece does
| Step | Command | Purpose |
|---|---|---|
| 1 | `npm run build` | Next.js production build |
| 2 | `npx opennextjs-cloudflare build` | Converts Next.js output to Cloudflare Worker format (`.open-next/worker.js`) |
| 3 | `npx wrangler deploy --config wrangler.worker.jsonc` | Deploys to `hmu-atl` worker → `atl.hmucashride.com` |

### DO NOT
- **DO NOT** deploy directly with `wrangler deploy` without a merged PR — this breaks git history
- **DO NOT** use `wrangler pages deploy` — that deploys to Pages, not the Worker
- **DO NOT** deploy without `--config wrangler.worker.jsonc` — the default `wrangler.jsonc` is for Pages
- **DO NOT** omit the custom domain route from `wrangler.worker.jsonc`
- **DO NOT** assume `git push` deploys anything — it only updates GitHub

### Clerk domain configuration
- Clerk publishable key is bound to `clerk.atl.hmucashride.com`
- `NEXT_PUBLIC_CLERK_DOMAIN=clerk.atl.hmucashride.com` must be set as a Worker secret
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` must be set as a Worker secret
- If the site is accessed on any other domain (e.g. `*.workers.dev`), Clerk handshake will fail

---

## CLOUDFLARE IMAGES (in-Worker pattern)

Image Transformations are enabled on the `hmucashride.com` zone with the R2 pub origin (`pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev`) on the Sources allowlist. Billed at $5/mo per 100k transforms; results cached at the edge.

### When you need it
- Server-rendered images (next/og share cards) where Satori must receive EXIF-rotated, resized JPEG bytes — Satori reads raw pixels and ignores EXIF, so iPhone portrait photos render sideways without a transform
- Anywhere user-uploaded R2 photos need uniform crops, format negotiation, or quality control

### How to invoke from a Worker / route handler
```ts
const resp = await fetch(sourceUrl, {
  cf: { image: { width: 800, format: 'jpeg', quality: 85 } },
} as RequestInit);
// resp.body is the transformed image
```

### DO NOT use the URL form from inside a Worker
```ts
// ❌ Returns 404 — same-zone subrequests bypass the /cdn-cgi/image interposer
const resp = await fetch(`${origin}/cdn-cgi/image/width=800/${sourceUrl}`);
```
The URL form (`/cdn-cgi/image/<options>/<source>`) is for **external clients** (browsers, OG validators, social crawlers) — those go through CF's edge transformer. Worker outbound subrequests don't, so the path 404s back to the Worker. This bug is invisible from outside (curl from your laptop returns 200), so always verify the actual fetch result inside the Worker.

### For next/og (Satori) specifically
Satori's own `<img>` fetch is also a Worker subrequest, so passing it a `/cdn-cgi/image/...` URL has the same 404 problem. Pattern: fetch bytes server-side via `cf.image`, base64-encode (chunked — `String.fromCharCode.apply` overflows past ~100k args), embed as `data:image/jpeg;base64,...`. Reference implementation: `app/api/og/driver/route.tsx`.

### Sources allowlist
Any new R2 bucket / external domain must be added to **Dash → Images → Transformations → Sources** before transforms will resolve. Without it, requests return `403 cf-not-resized: err=9524`.

---

## ENVIRONMENT VARIABLES

Never hardcode keys. Use `.env.local` locally, Cloudflare secrets in production.

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# Neon
DATABASE_URL=                        # pooled connection
DATABASE_URL_UNPOOLED=               # for migrations only

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
HMU_FIRST_PRICE_ID=                  # Stripe Price ID for $9.99/mo subscription
STRIPE_PLATFORM_ACCOUNT_ID=

# Ably
ABLY_API_KEY=                        # server-side ONLY — NEVER expose to client
NEXT_PUBLIC_ABLY_CLIENT_ID=

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_VERIFY_SERVICE_SID=

# OpenAI
OPENAI_API_KEY=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
```

---

## CLERK METADATA SCHEMA

```typescript
interface ClerkPublicMetadata {
  profileType: 'rider' | 'driver' | 'admin';
  accountStatus: 'pending' | 'active' | 'suspended';
  tier?: 'free' | 'hmu_first';        // drivers only
  ogStatus?: boolean;                 // riders only
  stripeAccountId?: string;           // drivers only
  stripeCustomerId?: string;
  videoIntroUrl?: string;
  completedRides: number;
  disputeCount: number;
  chillScore: number;
}
```

### Clerk Webhooks
| Event | Handler |
|---|---|
| `user.created` | Create Neon record + Stripe Customer + Stripe Connect (drivers) |
| `user.updated` | Sync to Neon |
| `user.deleted` | Soft delete Neon, cancel HMU First subscription |
| `session.created` | PostHog activation event |

---

## MCP TOOLS — RUNTIME API (Cloudflare Workers)

| Tool | Method | Endpoint |
|---|---|---|
| `check_driver_availability` | GET | `/api/tools/drivers/available` |
| `hold_payment` | POST | `/api/tools/payment/hold` |
| `release_payment` | POST | `/api/tools/payment/release` |
| `refund_payment` | POST | `/api/tools/payment/refund` |
| `track_ride` | POST | `/api/tools/ride/track` |
| `flag_dispute` | POST | `/api/tools/dispute/flag` |
| `sentiment_check` | POST | `/api/tools/sentiment/check` |
| `upgrade_rider` | POST | `/api/tools/rider/upgrade` |
| `notify_user` | POST | `/api/tools/notify` |
| `calculate_savings` | GET | `/api/tools/driver/savings` |
| `issue_ably_token` | POST | `/api/tools/ably/token` |
| `check_proximity` | POST | `/api/tools/geo/proximity` |

### `.claude.json` — MCP Server Config (project root)
```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp"],
      "env": { "STRIPE_SECRET_KEY": "${STRIPE_SECRET_KEY}" }
    },
    "neon": {
      "command": "npx",
      "args": ["-y", "@neondatabase/mcp-server-neon"],
      "env": { "NEON_API_KEY": "${NEON_API_KEY}" }
    },
    "cloudflare": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server-cloudflare"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "${CLOUDFLARE_ACCOUNT_ID}",
        "CLOUDFLARE_API_TOKEN": "${CLOUDFLARE_API_TOKEN}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

---

## CORE ARCHITECTURAL PRINCIPLES

### Schema Management
- **Schema Agent owns ALL migrations.** No other agent modifies schema directly.
- All agents import TypeScript types from `/lib/db/types.ts` — generated by Schema Agent.
- See [Schema](./docs/SCHEMA.md) for full database schema.

### Ride Flow
- **Payment capture happens at Start Ride**, not End Ride. Driver gets paid when rider gets in the car.
- See [Ride Flow State Machine](./docs/RIDE-FLOW.md) for complete flow + UI vocabulary.
- See [Payments](./docs/PAYMENTS.md) for Stripe integration details.

### Realtime Architecture
- **Ably = realtime. Neon = truth.** Every Ably event MUST simultaneously write to Neon.
- See [Realtime](./docs/REALTIME.md) for channel architecture + GPS tracking rules.

### UI Philosophy
- **Mobile-first always**: Design for 390px width first, scale up
- **Dark-mode ready**: Use CSS variables, never hardcode colors
- **Atlanta aesthetic**: Dark backgrounds, vibrant accent colors, bold typography
- See [UI Components](./docs/UI-COMPONENTS.md) for design system + 21st.dev registry.

### Agent Rules
1. NEVER modify Neon schema directly — route all changes through Schema Agent
2. Import TypeScript types from `/lib/db/types.ts` only
3. All API routes must have Clerk auth middleware
4. All API routes must have Upstash rate limiting
5. Every user action fires a PostHog event
6. Commit to your own Git branch — never commit to main directly
7. Document your owned files in your SCOPE section below

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

*Claude Code reads this file automatically at the start of every session.*
*Each agent's CLAUDE.md appends its specific SCOPE section below this line.*

---
## AGENT SCOPE — [REPLACE THIS WITH AGENT NAME]

**This agent owns:**
- (list files and directories)

**This agent does NOT touch:**
- (list explicitly)

**Definition of done for this agent:**
- (specific acceptance criteria)
