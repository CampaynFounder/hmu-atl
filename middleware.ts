// Middleware for Route Protection
// Handles Clerk authentication and route-based authorization

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { getStateCached } from '@/lib/maintenance';

// Attribution cookie — first-touch ID, 30-day lifetime. Pure cookie (no DB hit).
// Only set on non-API public routes; webhooks and API calls stay untouched.
const ATTRIB_COOKIE = 'hmu_attrib_id';
const ATTRIB_MAX_AGE_S = 60 * 60 * 24 * 30;

// Known market subdomains. Must match markets.subdomain in Neon. Keep this
// list tight — parsing an arbitrary subdomain into a slug would let preview
// domains or typos spoof a market. New markets: add the slug here.
const KNOWN_MARKET_SUBDOMAINS = new Set(['atl', 'nola']);

// Extract a trusted market slug from the Host header. Returns null unless the
// host is a known market subdomain (atl.hmucashride.com, nola.hmucashride.com,
// …). Multi-level subdomains like clerk.atl.hmucashride.com produce null —
// only the root-level subdomain is a market identifier.
function marketSlugFromHost(req: NextRequest): string | null {
  const host = req.headers.get('host')?.toLowerCase().split(':')[0] || '';
  if (!host.endsWith('.hmucashride.com')) return null;
  const sub = host.slice(0, -('.hmucashride.com'.length));
  if (!sub || sub.includes('.') || !KNOWN_MARKET_SUBDOMAINS.has(sub)) return null;
  return sub;
}

// Build a NextResponse.next() with x-market-slug stamped on the request
// headers so server components can read it via next/headers. Also handles
// the attribution cookie.
function buildPublicResponse(req: NextRequest): NextResponse {
  const slug = marketSlugFromHost(req);
  const requestHeaders = slug
    ? (() => {
        const h = new Headers(req.headers);
        h.set('x-market-slug', slug);
        return h;
      })()
    : req.headers;

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  // Attribution cookie — GET, non-API, no existing cookie
  const needsCookie = !req.cookies.has(ATTRIB_COOKIE)
    && !req.nextUrl.pathname.startsWith('/api')
    && req.method === 'GET';
  if (needsCookie) {
    res.cookies.set(ATTRIB_COOKIE, crypto.randomUUID(), {
      maxAge: ATTRIB_MAX_AGE_S,
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }
  return res;
}

// Maintenance mode is now controlled from /admin/maintenance (DB-backed).
// The flag + message live in the `maintenance_mode` singleton table and are
// read through a 30s module-level cache in lib/maintenance.ts. Fails open
// on any DB error so a Neon blip can't black-hole the app.

// Routes that stay up during maintenance (marketing, legal, admin, APIs
// that cron / webhooks / waitlist posts all depend on).
const isMaintenanceExempt = createRouteMatcher([
  '/',
  '/.well-known(.*)',
  '/driver',
  '/rider',
  '/privacy',
  '/terms',
  '/about',
  '/team',
  '/careers',
  '/press',
  '/blog(.*)',
  '/safety',
  '/pricing',
  '/help',
  '/guidelines',
  '/cookies',
  '/contact',
  '/guide/(.*)',
  '/data-room(.*)',
  '/api/data-room(.*)',
  '/pitch(.*)',
  '/d/(.*)',
  '/api/og/(.*)',
  '/api/content/(.*)',
  '/api/webhooks(.*)',
  '/api/meta-verify',
  '/api/cron/(.*)',
  '/api/maintenance(.*)',
  '/maintenance',
  '/admin(.*)',
  '/api/admin(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/auth-callback(.*)',
]);

// Define public routes (accessible without authentication)
const isPublicRoute = createRouteMatcher([
  '/',
  '/.well-known(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/auth-callback(.*)',
  '/api/webhooks(.*)',
  '/api/meta-verify',
  '/api/cron/(.*)',
  '/api/maintenance(.*)',
  '/d/(.*)',
  '/api/drivers/:handle',
  '/api/chat/booking',
  '/api/chat/support',
  '/api/og/(.*)',
  '/api/content/(.*)',
  '/driver',
  '/driver/express(.*)',
  '/rider',
  '/rider/home',
  '/privacy',
  '/terms',
  '/about',
  '/team',
  '/careers',
  '/press',
  '/blog(.*)',
  '/safety',
  '/pricing',
  '/help',
  '/guidelines',
  '/cookies',
  '/contact',
  '/guide/(.*)',
  '/data-room(.*)',
  '/api/data-room(.*)',
  '/pitch(.*)',
  '/api/pitch-videos',
  '/admin(.*)',
  '/api/admin(.*)',
  '/maintenance',
]);

// Define pending-only routes (only for pending_activation users)
const isPendingRoute = createRouteMatcher(['/pending']);

// Define admin routes (require admin profile_type — enforced in layout/API)
const isAdminRoute = createRouteMatcher(['/admin(.*)']);

// Define protected routes that require active status
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/profile(.*)',
  '/rides(.*)',
  '/ride(.*)',
  '/driver(.*)',
  '/rider(.*)',
  '/hmu(.*)',
  '/payouts(.*)',
  '/settings(.*)',
  '/admin(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  // MAINTENANCE MODE: dynamic DB-backed. When enabled, non-exempt routes
  // (authenticated app surfaces) redirect to /maintenance. Admin, webhooks,
  // crons, sign-in, and marketing all stay live.
  if (!isMaintenanceExempt(req)) {
    const maintenance = await getStateCached();
    if (maintenance.enabled) {
      return NextResponse.redirect(new URL('/maintenance', req.url));
    }
  }

  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return buildPublicResponse(req);
  }

  // Protect all other routes — redirect to our sign-in page if not authenticated
  await auth.protect({
    unauthenticatedUrl: new URL('/sign-in', req.url).toString(),
  });

  // For authenticated routes, still stamp x-market-slug so post-auth server
  // components can read the subdomain if they want (rare — most use users.market_id).
  const slug = marketSlugFromHost(req);
  if (slug) {
    const headers = new Headers(req.headers);
    headers.set('x-market-slug', slug);
    return NextResponse.next({ request: { headers } });
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and .well-known
    '/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|mov|webm|ogg|mp3|wav)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
