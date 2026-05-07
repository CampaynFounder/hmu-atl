#!/usr/bin/env bash
# Bulk-set Cloudflare Worker secrets for the staging `hmu-atl-staging` worker.
#
# Why this exists: the 2026-05-06 secret-leak incident showed that Worker
# secrets MUST be set before the first user-facing deploy. The previous
# pattern (run `wrangler secret put` 22 times, paste each value) was slow
# and error-prone. Bulk-set from a single temp file, then auto-delete the
# file on exit — same shape as scripts/rotate-prod-secrets.sh.
#
# Usage:
#   1. Generate the template:  ./scripts/set-staging-secrets.sh template > .dev.vars.staging.tmp
#   2. Fill in real values in .dev.vars.staging.tmp
#   3. Run:                    ./scripts/set-staging-secrets.sh
#
# The temp file is deleted automatically when the script exits, even on
# Ctrl-C or error — so it cannot survive past the run that uses it.
# It is also gitignored.
set -euo pipefail

FILE=".dev.vars.staging.tmp"
WRANGLER_CONFIG="wrangler.staging.jsonc"

if [[ "${1:-}" == "template" ]]; then
  cat <<'EOF'
# Fill each REPLACE_ME with the staging value, then save and run:
#   ./scripts/set-staging-secrets.sh
# This file is auto-deleted by the script on exit and is gitignored.
#
# Tips:
#   - DATABASE_URL  → Neon dashboard → staging branch → Connection details (pooled)
#   - STRIPE_*      → Stripe Test Mode keys (sk_test_, pk_test_, whsec_test_)
#   - CLERK_*       → A NEW Clerk application (separate from prod), API Keys page
#   - PostHog       → Separate project so staging events don't pollute prod funnels
#
# DELIBERATELY NOT INCLUDED (see docs/STAGING-SETUP-RUNBOOK.md B4a):
#   - TWILIO_*       (codebase has zero Twilio references)
#   - UPSTASH_*      (not wired up in prod either)
#   - VOIPMS_*       (textbee.ts auto-skips sends when unset → no SMS in staging)

# --- Database (Neon staging branch) ---
DATABASE_URL=REPLACE_ME
DATABASE_URL_UNPOOLED=REPLACE_ME

# --- Clerk staging app ---
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=REPLACE_ME
NEXT_PUBLIC_CLERK_DOMAIN=REPLACE_ME
CLERK_SECRET_KEY=REPLACE_ME
CLERK_WEBHOOK_SECRET=REPLACE_ME

# --- Stripe Test Mode ---
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=REPLACE_ME
STRIPE_SECRET_KEY=REPLACE_ME
STRIPE_WEBHOOK_SECRET=REPLACE_ME
HMU_FIRST_PRICE_ID=REPLACE_ME

# --- Ably (reuse prod for now; ideally separate workspace later) ---
ABLY_API_KEY=REPLACE_ME
NEXT_PUBLIC_ABLY_CLIENT_ID=REPLACE_ME

# --- Mapbox (same token works for both envs) ---
NEXT_PUBLIC_MAPBOX_TOKEN=REPLACE_ME

# --- OpenAI ---
OPENAI_API_KEY=REPLACE_ME

# --- PostHog (separate project) ---
NEXT_PUBLIC_POSTHOG_KEY=REPLACE_ME

# --- Cron (any random string; mirror as a GitHub repo secret too) ---
CRON_SECRET=REPLACE_ME
EOF
  exit 0
fi

if [[ ! -f "$FILE" ]]; then
  echo "ERROR: $FILE not found." >&2
  echo "Generate a template with: ./scripts/set-staging-secrets.sh template > $FILE" >&2
  exit 1
fi

# Refuse to proceed if any *uncommented* value is still REPLACE_ME.
if grep -E '^[^#]*=REPLACE_ME\s*$' "$FILE" > /dev/null; then
  echo "ERROR: $FILE still has REPLACE_ME values on uncommented lines. Fill them in." >&2
  exit 1
fi

cleanup() {
  if [[ -f "$FILE" ]]; then
    rm -f "$FILE"
    echo "✓ Staging rotation file deleted."
  fi
}
trap cleanup EXIT INT TERM

echo "→ Pushing staging secrets to hmu-atl-staging worker..."
npx wrangler secret bulk "$FILE" --config "$WRANGLER_CONFIG"

echo ""
echo "Next:"
echo "  1. npm run deploy:staging"
echo "  2. curl https://hmu-atl-staging.<account>.workers.dev/api/health  (expect db.ok:true)"
echo "  3. Phase B6 in docs/STAGING-SETUP-RUNBOOK.md — custom domain"
