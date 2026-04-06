#!/bin/bash
# Toggle between production and demo Clerk keys for screen recording
# Usage: ./scripts/demo-mode.sh on    — switch to dev keys
#        ./scripts/demo-mode.sh off   — switch back to live keys

ENV_FILE=".env.local"

# Production keys (your live keys)
PROD_PK="pk_live_Y2xlcmsuYXRsLmhtdWNhc2hyaWRlLmNvbSQ"
PROD_SK="sk_live_hVcQ5KNpj2SpATUH0yd7ovn5EpnB17i9z2umQ8DIJX"

# Development keys
DEV_PK="pk_test_cm9idXN0LXN3YW4tMy5jbGVyay5hY2NvdW50cy5kZXYk"
DEV_SK="sk_test_q3x7DuWmk6jLCcTsA5xQeWMk42V2bvz8MP7FkyDuYv"

if [ "$1" = "on" ]; then
  echo "🎬 Switching to DEMO mode (Clerk dev keys)..."
  sed -i '' "s|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$DEV_PK|" "$ENV_FILE"
  sed -i '' "s|CLERK_SECRET_KEY=.*|CLERK_SECRET_KEY=$DEV_SK|" "$ENV_FILE"
  # Comment out custom domain (dev instance doesn't use it)
  sed -i '' "s|^NEXT_PUBLIC_CLERK_DOMAIN=|# NEXT_PUBLIC_CLERK_DOMAIN=|" "$ENV_FILE"
  echo "Done. Restart your dev server: npm run dev"
  echo "Sign up test accounts and record your flows."

elif [ "$1" = "off" ]; then
  echo "Switching back to PRODUCTION mode (Clerk live keys)..."
  sed -i '' "s|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$PROD_PK|" "$ENV_FILE"
  sed -i '' "s|CLERK_SECRET_KEY=.*|CLERK_SECRET_KEY=$PROD_SK|" "$ENV_FILE"
  # Restore custom domain
  sed -i '' "s|^# NEXT_PUBLIC_CLERK_DOMAIN=|NEXT_PUBLIC_CLERK_DOMAIN=|" "$ENV_FILE"
  echo "Done. Restart your dev server."

else
  echo "Usage: ./scripts/demo-mode.sh [on|off]"
  echo "  on  — switch to Clerk dev keys for recording"
  echo "  off — switch back to Clerk live keys"
fi
