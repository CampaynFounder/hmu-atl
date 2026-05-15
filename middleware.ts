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
  // x-admin-pathname feeds the route-level permission guard in
  // `app/admin/layout.tsx`. We stamp it for any /admin/* request because the
  // admin tree is registered as `isPublicRoute` (auth is enforced inside the
  // layout, not at middleware), so this is the only path admin requests take.
  const isAdminPath = req.nextUrl.pathname.startsWith('/admin');
  const requestHeaders = (slug || isAdminPath)
    ? (() => {
        const h = new Headers(req.headers);
        if (slug) h.set('x-market-slug', slug);
        if (isAdminPath) h.set('x-admin-pathname', req.nextUrl.pathname);
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
  '/safety/(.*)',
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
  '/api/health',
  '/maintenance',
  '/events',
  '/api/events(.*)',
  '/compare',
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
  '/api/health',
  '/d/(.*)',
  '/api/drivers/:handle',
  '/api/chat/booking',
  '/api/chat/support',
  '/api/og/(.*)',
  '/api/content/(.*)',
  '/api/onboarding/driver-express-config',
  '/api/onboarding/rider-profile-fields-config',
  '/driver',
  '/driver/express(.*)',
  '/r/(.*)',  // rider ad-funnel landing (paid Meta/TikTok ads link target)
  '/rider',
  '/rider/home',
  '/rider/browse(.*)',     // includes /rider/browse/blast (unauth-friendly blast landing)
  '/blast',                // Blast v3 unauth social-proof landing page (Stream A)
  '/rider/blast/new',      // the form itself; auth gate is on submit, not page load
  '/auth-callback/blast',  // post-Clerk handoff; renders mid-handshake for spinner state
  '/api/blast/estimate',   // pre-auth pricing estimate for the blast form
  '/api/blast',            // blast booking endpoint — auth checked in handler, returns 401 JSON if unauthorized
  '/api/public/(.*)',
  '/api/rider/browse/(.*)',
  '/privacy',
  '/terms',
  '/about',
  '/team',
  '/careers',
  '/press',
  '/blog(.*)',
  '/safety',
  '/safety/(.*)',
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
  '/events',
  '/api/events(.*)',
  '/compare',
  '/admin(.*)',
  '/api/admin(.*)',
  '/maintenance',
  '/debug/geo',
  '/debug/deposits',
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
  // APEX → ATL: hmucashride.com (and www.) serve the same worker as the
  // atl subdomain, which left two canonical URLs in circulation. Social
  // scrapers hate the canonical/og:url mismatch and any link shared at the
  // apex skips Clerk's market-bound publishable key. 308 keeps the method
  // and is permanently cached. /api/*, /_next/*, and /.well-known/* stay
  // on the apex so externally-configured webhooks + domain verification
  // don't break if anything is pointed there.
  const host = req.headers.get('host')?.toLowerCase().split(':')[0] || '';
  if (host === 'hmucashride.com' || host === 'www.hmucashride.com') {
    const path = req.nextUrl.pathname;
    const skipApexRedirect = path.startsWith('/api/')
      || path.startsWith('/_next/')
      || path.startsWith('/.well-known/');
    if (!skipApexRedirect) {
      const target = `https://atl.hmucashride.com${path}${req.nextUrl.search}`;
      return NextResponse.redirect(target, 308);
    }
  }

  // MAINTENANCE MODE: dynamic DB-backed. When enabled, non-exempt routes
  // (authenticated app surfaces) redirect to /maintenance. Admin, webhooks,
  // crons, sign-in, and marketing all stay live.
  if (!isMaintenanceExempt(req)) {
    const maintenance = await getStateCached();
    if (maintenance.enabled) {
      return NextResponse.redirect(new URL('/maintenance', req.url));
    }
  }

  // PREVIEW-ROLE READ-ONLY GUARD: when a super admin is previewing as a lower
  // role, they should be able to navigate the portal exactly as that role
  // would, but they should NOT be able to take destructive actions while
  // wearing someone else's permissions. Block all non-GET /api/admin/* calls
  // when the preview cookie is set, with one exception: the preview-role
  // endpoint itself, so the admin can exit preview without first un-setting
  // it through the cookie store.
  const previewCookie = req.cookies.get('admin_preview_role_id')?.value;
  if (
    previewCookie
    && req.nextUrl.pathname.startsWith('/api/admin/')
    && req.method !== 'GET'
    && req.nextUrl.pathname !== '/api/admin/preview-role'
  ) {
    return NextResponse.json(
      { error: 'Read-only while previewing as another role. Exit preview to make changes.' },
      { status: 403 },
    );
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
