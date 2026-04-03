# HMU ATL — Clerk Auth Strategy & Configuration

> Reference doc for all Clerk auth decisions, configurations, and gotchas.
> Last updated: 2026-04-03

---

## Domain Configuration

| Setting | Value | Why |
|---|---|---|
| **Production domain** | `atl.hmucashride.com` | Cloudflare Worker serves the app here |
| **Clerk custom domain** | `clerk.atl.hmucashride.com` | Routes Clerk API through first-party domain — fixes Safari ITP cookie blocking |
| **Clerk publishable key** | Bound to `clerk.atl.hmucashride.com` | Must match the custom domain or handshake fails |

### DNS Records (Cloudflare)

The Clerk custom domain requires a CNAME record in Cloudflare:

```
clerk.atl.hmucashride.com → frontend-api.clerk.dev (proxied OFF — gray cloud)
```

Clerk provides this CNAME during custom domain setup in the Clerk Dashboard.

### Critical: Domain Mismatch = Handshake Error

If the app is accessed on any domain OTHER than `atl.hmucashride.com`, Clerk handshake will fail. This includes:
- `*.workers.dev` (Cloudflare Worker preview domain)
- `*.pages.dev` (Cloudflare Pages preview domain)
- `localhost` uses dev keys which are different

---

## Environment Variables

```bash
# .env.local (local dev) and Cloudflare Worker secrets (production)

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...   # Clerk Dashboard > API Keys
CLERK_SECRET_KEY=sk_live_...                     # Clerk Dashboard > API Keys
CLERK_WEBHOOK_SECRET=whsec_...                   # Clerk Dashboard > Webhooks

# Custom domain — routes auth through first-party domain
NEXT_PUBLIC_CLERK_DOMAIN=clerk.atl.hmucashride.com

# Redirect URLs — safety net for OAuth round-trips
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/auth-callback
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/auth-callback
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/auth-callback
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/auth-callback
```

All of these must be set as **Cloudflare Worker secrets** via:
```bash
npx wrangler secret put VARIABLE_NAME --config wrangler.worker.jsonc
```

---

## Auth Flow — How Users Get In

### 1. Sign-Up Flow

```
Landing Page (/driver or /rider)
  → /sign-up?type=driver (or rider)
  → Clerk <SignUp> component (Google, Apple, email)
  → localStorage saves type (survives OAuth redirect)
  → /auth-callback
  → Checks if user has a profile (API call)
  → No profile → /onboarding?type=driver
  → Onboarding creates Neon profile + syncs Clerk publicMetadata
  → Redirect to /driver/home or /rider/home
```

### 2. Sign-In Flow (Returning User)

```
/sign-in?type=driver
  → Clerk <SignIn> component
  → /auth-callback
  → Checks profile exists
  → Has profile → /driver/home or /rider/home
```

### 3. OAuth Round-Trip Hack

Google/Apple OAuth does a full-page redirect. URL query params (`?type=driver`) get lost.

**Solution**: `SignUpTypeStore` component saves `type` and `returnTo` to `localStorage` BEFORE the OAuth redirect. The `/auth-callback` page reads it back after OAuth returns.

**File**: `app/sign-up/[[...sign-up]]/type-store.tsx`

### 4. In-App Browser Gate

Facebook, Instagram, TikTok, and other social app browsers block Clerk auth (cookies don't work).

**Solution**: `InAppBrowserGate` component detects these browsers and shows a "Open in Browser" prompt before rendering the auth form.

**File**: `components/auth/in-app-browser-gate.tsx`

---

## Middleware — Route Protection

**File**: `middleware.ts`

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/', '/sign-in(.*)', '/sign-up(.*)', '/auth-callback(.*)',
  '/api/webhooks(.*)', '/d/(.*)', '/driver', '/rider',
  '/privacy', '/terms', '/guide/(.*)',
  '/admin(.*)', '/api/admin(.*)',   // Admin auth handled in layout/API, not middleware
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  await auth.protect({ unauthenticatedUrl: new URL('/sign-in', req.url).toString() });
});
```

**Note**: Admin routes are public in middleware but protected in the admin layout (server-side DB check for `is_admin` flag). This is intentional — middleware can't do DB queries.

---

## Clerk-Neon Sync Architecture

```
Clerk (auth provider)          Neon (data store)
─────────────────              ─────────────────
user.id (clerk_id)      →     users.clerk_id
publicMetadata.profileType →   users.profile_type
publicMetadata.tier      →     users.tier
publicMetadata.accountStatus → users.account_status
                               users.is_admin (Neon-only, not in Clerk)
```

### publicMetadata Schema

```typescript
interface ClerkPublicMetadata {
  profileType: 'rider' | 'driver' | 'admin';
  accountStatus: 'pending' | 'active' | 'suspended';
  tier?: 'free' | 'hmu_first';        // drivers only
  ogStatus?: boolean;                  // riders only
  stripeAccountId?: string;            // drivers only
  stripeCustomerId?: string;
  completedRides: number;
  disputeCount: number;
  chillScore: number;
}
```

publicMetadata is readable client-side without a DB query — used for:
- Showing driver vs rider UI
- HMU First badge
- Quick profile info in header

---

## Webhook Handler

**File**: `app/api/webhooks/clerk/route.ts`

| Event | What Happens |
|---|---|
| `user.created` | Create Neon user record (pending_activation), create Stripe Customer, create Stripe Connect account (drivers) |
| `user.updated` | Sync metadata changes to Neon |
| `user.deleted` | Delete Neon user record (cascade deletes profiles) |

Webhook verification uses **Svix** library with headers: `svix-id`, `svix-timestamp`, `svix-signature`.

**Webhook URL in Clerk Dashboard**: `https://atl.hmucashride.com/api/webhooks/clerk`

---

## API Route Auth Patterns

### Standard Route (requires any authenticated user)

```typescript
import { auth } from '@clerk/nextjs/server';

const { userId: clerkId } = await auth();
if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
```

### Admin Route (requires is_admin flag in Neon)

```typescript
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

const admin = await requireAdmin();
if (!admin) return unauthorizedResponse();  // 403
```

### Server Component Auth

```typescript
import { getCurrentUser } from '@/lib/auth/get-current-user';

const user = await getCurrentUser();
if (!user) redirect('/sign-in');
```

---

## Admin Auth — Separate from Clerk Roles

Admin access is controlled by `users.is_admin` boolean in Neon, NOT by Clerk roles or organizations.

**Why**: Simpler, no Clerk org setup needed, admin flag is checked server-side only.

**Protected at two layers**:
1. **Admin layout** (`app/admin/layout.tsx`) — server component redirects non-admins
2. **Admin API routes** — `requireAdmin()` helper checks `is_admin` in every handler

---

## Key Files Reference

| File | Purpose |
|---|---|
| `middleware.ts` | Route protection — public vs authenticated |
| `app/layout.tsx` | `<ClerkProvider>` wraps entire app |
| `app/sign-in/[[...sign-in]]/page.tsx` | Sign-in UI with type-aware branding |
| `app/sign-up/[[...sign-up]]/page.tsx` | Sign-up UI with type-aware branding |
| `app/sign-up/[[...sign-up]]/type-store.tsx` | localStorage hack for OAuth |
| `app/auth-callback/page.tsx` | Post-auth routing logic |
| `components/auth/in-app-browser-gate.tsx` | Social app browser detection |
| `app/api/webhooks/clerk/route.ts` | Webhook handler (user sync) |
| `lib/auth/get-current-user.ts` | Server component auth helper |
| `lib/admin/helpers.ts` | `requireAdmin()` guard |
| `app/admin/layout.tsx` | Admin route protection |
| `lib/db/users.ts` | Clerk-Neon user creation |
| `components/layout/header.tsx` | Client-side auth state (useUser) |

---

## Gotchas & Things That Will Break

1. **Deploying to wrong domain** → Clerk handshake error. Only `atl.hmucashride.com` works.
2. **Missing NEXT_PUBLIC_CLERK_DOMAIN secret** → Falls back to Clerk's default domain, Safari ITP blocks cookies.
3. **Clerk webhook URL wrong** → Users sign up but no Neon record gets created. Ghost users.
4. **In-app browsers** → Auth silently fails. The in-app browser gate catches most cases.
5. **OAuth losing params** → The localStorage hack in `type-store.tsx` handles this. Without it, all OAuth users land as "unknown" type.
6. **Admin access** → Set `is_admin = true` directly in Neon SQL. No Clerk dashboard toggle exists for this.

---

## Clerk Dashboard Settings Checklist

- [ ] Application name: HMU ATL
- [ ] Custom domain: `clerk.atl.hmucashride.com` (verified)
- [ ] Allowed origins: `https://atl.hmucashride.com`
- [ ] Webhook endpoint: `https://atl.hmucashride.com/api/webhooks/clerk`
- [ ] Webhook events: `user.created`, `user.updated`, `user.deleted`
- [ ] Social connections: Google, Apple (both enabled)
- [ ] Email authentication: enabled
- [ ] Phone authentication: disabled (Twilio handles phone separately)

---

## Package

```json
"@clerk/nextjs": "^6.39.1"
```
