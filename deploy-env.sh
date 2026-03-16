#!/bin/bash

# Deploy environment variables to Cloudflare Pages
# Usage: ./deploy-env.sh

PROJECT_NAME="hmu-atl"

echo "📦 Deploying environment variables to Cloudflare Pages: $PROJECT_NAME"
echo ""

# Set environment variables for production
npx wrangler pages secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY --project-name=$PROJECT_NAME <<< "pk_test_cm9idXN0LXN3YW4tMy5jbGVyay5hY2NvdW50cy5kZXYk"

npx wrangler pages secret put CLERK_SECRET_KEY --project-name=$PROJECT_NAME <<< "sk_test_q3x7DuWmk6jLCcTsA5xQeWMk42V2bvz8MP7FkyDuYv"

npx wrangler pages secret put CLERK_WEBHOOK_SECRET --project-name=$PROJECT_NAME <<< "whsec_5ht/1ubhkFsSu4CUy9jRhnMdj2kZGbrR"

npx wrangler pages secret put DATABASE_URL --project-name=$PROJECT_NAME <<< "postgresql://neondb_owner:npg_2NBpz0lJmDML@ep-tiny-dew-an6h1lzy-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"

npx wrangler pages secret put DATABASE_URL_UNPOOLED --project-name=$PROJECT_NAME <<< "postgresql://neondb_owner:npg_2NBpz0lJmDML@ep-tiny-dew-an6h1lzy.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require"

npx wrangler pages secret put STRIPE_MOCK --project-name=$PROJECT_NAME <<< "true"

echo ""
echo "✅ All environment variables deployed!"
echo "🔄 Cloudflare will automatically redeploy your project with the new variables"
