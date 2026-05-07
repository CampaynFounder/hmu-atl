#!/bin/bash
# Toggle .env.local between live and dev Clerk keys for screen recording.
# Reads keys from ~/.hmu-clerk-keys (outside the repo) so nothing here
# can ever be committed. First run: copy ~/.hmu-clerk-keys.example, fill in
# your live + dev publishable + secret keys, then run this script.

set -euo pipefail

KEYS_FILE="${HOME}/.hmu-clerk-keys"
ENV_FILE=".env.local"

if [ ! -f "$KEYS_FILE" ]; then
  cat <<EOF
Missing key file: $KEYS_FILE

Create it with the following shape (chmod 600):

  PROD_PK="pk_live_..."
  PROD_SK="sk_live_..."
  DEV_PK="pk_test_..."
  DEV_SK="sk_test_..."

Then re-run: $0 [on|off]
EOF
  exit 1
fi

# shellcheck disable=SC1090
source "$KEYS_FILE"

for var in PROD_PK PROD_SK DEV_PK DEV_SK; do
  if [ -z "${!var:-}" ]; then
    echo "Missing $var in $KEYS_FILE"
    exit 1
  fi
done

case "${1:-}" in
  on)
    echo "Switching to DEMO mode (Clerk dev keys)..."
    sed -i '' "s|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$DEV_PK|" "$ENV_FILE"
    sed -i '' "s|CLERK_SECRET_KEY=.*|CLERK_SECRET_KEY=$DEV_SK|" "$ENV_FILE"
    sed -i '' "s|^NEXT_PUBLIC_CLERK_DOMAIN=|# NEXT_PUBLIC_CLERK_DOMAIN=|" "$ENV_FILE"
    echo "Done. Restart your dev server."
    ;;
  off)
    echo "Switching to PRODUCTION mode (Clerk live keys)..."
    sed -i '' "s|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=.*|NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$PROD_PK|" "$ENV_FILE"
    sed -i '' "s|CLERK_SECRET_KEY=.*|CLERK_SECRET_KEY=$PROD_SK|" "$ENV_FILE"
    sed -i '' "s|^# NEXT_PUBLIC_CLERK_DOMAIN=|NEXT_PUBLIC_CLERK_DOMAIN=|" "$ENV_FILE"
    echo "Done. Restart your dev server."
    ;;
  *)
    echo "Usage: $0 [on|off]"
    echo "  on  — switch .env.local to Clerk dev keys"
    echo "  off — switch .env.local to Clerk live keys"
    exit 2
    ;;
esac
