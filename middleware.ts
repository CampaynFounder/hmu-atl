// Middleware for Route Protection
// Handles Clerk authentication and route-based authorization

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getStateCached } from '@/lib/maintenance';

// Attribution cookie — first-touch ID, 30-day lifetime. Pure cookie (no DB hit).
// Only set on non-API public routes; webhooks and API calls stay untouched.
const ATTRIB_COOKIE = 'hmu_attrib_id';
const ATTRIB_MAX_AGE_S = 60 * 60 * 24 * 30;

// Known market subdomains. Must match markets.subdomain in Neon. Keep this
// list tight — parsing an arbitrary subdomain into a slug would let preview
// domains or typos spoof a market. New markets: add the slug here.
const KNOWN_MARKET_SUBDOMAINS = new Set(['atl', 'nola']);

// Market geo centers used for apex routing. Two behaviors:
//   redirect:true  → send user to {slug}.hmucashride.com (only ATL — has existing
//                    users + Clerk primary, so the subdomain is load-bearing)
//   redirect:false → stamp x-market-slug header, serve them on apex
//                    (requires hmucashride.com to be a Clerk satellite)
//
// New markets: add with redirect:false. No Clerk satellite per-market needed.
const MARKET_CENTERS = [
  { slug: 'atl',   lat: 33.7490, lng: -84.3880, radiusMiles: 60, redirect: true  },
  { slug: 'nola',  lat: 29.9511, lng: -90.0715, radiusMiles: 50, redirect: false },
  // Georgia
  { slug: 'aug',   lat: 33.4735, lng: -82.0105, radiusMiles: 30, redirect: false },
  { slug: 'macon', lat: 32.8407, lng: -83.6324, radiusMiles: 30, redirect: false },
  { slug: 'sav',   lat: 32.0809, lng: -81.0912, radiusMiles: 30, redirect: false },
  { slug: 'vld',   lat: 30.8327, lng: -83.2785, radiusMiles: 25, redirect: false },
  { slug: 'csg',   lat: 32.4610, lng: -84.9877, radiusMiles: 25, redirect: false },
  // Florida
  { slug: 'tpa',   lat: 27.9506, lng: -82.4572, radiusMiles: 40, redirect: false },
  { slug: 'mia',   lat: 26.0000, lng: -80.2000, radiusMiles: 40, redirect: false },
  { slug: 'orl',   lat: 28.5383, lng: -81.3792, radiusMiles: 35, redirect: false },
  // Tennessee
  { slug: 'mem',   lat: 35.1495, lng: -90.0490, radiusMiles: 40, redirect: false },
  { slug: 'bna',   lat: 36.1627, lng: -86.7816, radiusMiles: 40, redirect: false },
  { slug: 'knx',   lat: 35.9606, lng: -83.9207, radiusMiles: 30, redirect: false },
  { slug: 'cha',   lat: 35.0456, lng: -85.3097, radiusMiles: 30, redirect: false },
  // Alabama
  { slug: 'bhm',   lat: 33.5186, lng: -86.8104, radiusMiles: 35, redirect: false },
  { slug: 'mgm',   lat: 32.3668, lng: -86.3000, radiusMiles: 30, redirect: false },
  // Texas
  { slug: 'hou',   lat: 29.7604, lng: -95.3698, radiusMiles: 50, redirect: false },
  { slug: 'dfw',   lat: 32.7767, lng: -96.7970, radiusMiles: 50, redirect: false },
  // Southeast / Midwest
  { slug: 'clt',   lat: 35.2271, lng: -80.8431, radiusMiles: 35, redirect: false },
  { slug: 'chi',   lat: 41.8781, lng: -87.6298, radiusMiles: 45, redirect: false },
  { slug: 'dtw',   lat: 42.3314, lng: -83.0458, radiusMiles: 40, redirect: false },
  { slug: 'stl',   lat: 38.6270, lng: -90.1994, radiusMiles: 40, redirect: false },
  { slug: 'cin',   lat: 39.1031, lng: -84.5120, radiusMiles: 35, redirect: false },
] as const;

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type MarketCenter = typeof MARKET_CENTERS[number];

// Cloudflare edge geolocation for the current request. Under
// @opennextjs/cloudflare the incoming `request.cf` is NOT re-attached to the
// NextRequest that middleware sees — OpenNext stashes it on its own context
// instead (see cloudflareContextALS.run({ ..., cf: request.cf })). Reading
// `req.cf` therefore returns undefined and silently geo-gates every visitor
// (the bug this replaced). Returns undefined when geo is unavailable so callers
// can fail open instead of dead-ending real visitors on the waitlist.
function readCfGeo(): { lat: number; lng: number; city: string } | undefined {
  let cf: { latitude?: string; longitude?: string; city?: string } | undefined;
  try {
    cf = getCloudflareContext().cf as typeof cf;
  } catch {
    return undefined; // outside the worker runtime (SSG/dev) — fail open
  }
  const lat = parseFloat(cf?.latitude ?? '');
  const lng = parseFloat(cf?.longitude ?? '');
  if (!isFinite(lat) || !isFinite(lng)) return undefined;
  return { lat, lng, city: cf?.city ?? '' };
}

// Nearest live market whose radius contains the point, or null if the point is
// outside every market (Memphis, Dallas…). Callers distinguish this "confirmed
// out of market" null from "no geo at all" (readCfGeo returned undefined).
function nearestMarket(lat: number, lng: number): MarketCenter | null {
  let best: MarketCenter | null = null;
  let minDist = Infinity;
  for (const m of MARKET_CENTERS) {
    const d = haversineDistanceMiles(lat, lng, m.lat, m.lng);
    if (d < m.radiusMiles && d < minDist) { minDist = d; best = m; }
  }
  return best;
}

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
  '/faq',
  '/llms.txt',
  '/safety',
  '/safety/(.*)',
  '/pricing',
  '/help',
  '/support',
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
  '/api/blast/cron/(.*)',
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
  '/api/blast/cron/(.*)',
  '/api/maintenance(.*)',
  '/api/health',
  '/d/(.*)',
  '/api/driver/:handle',
  '/api/chat/booking',
  '/api/chat/support',
  '/api/og/(.*)',
  '/api/content/(.*)',
  '/api/onboarding/driver-express-config',
  '/api/onboarding/rider-profile-fields-config',
  '/driver',
  '/driver/express(.*)',
  '/driver/payout-complete(.*)',  // Stripe Connect mobile return bounce — must be public (no Clerk session in the in-app browser)
  '/driver/payout-setup/embedded-mobile(.*)',  // embedded Connect onboarding in the in-app WebView — auth via injected bearer token, not cookies
  '/r/(.*)',  // rider ad-funnel landing (paid Meta/TikTok ads link target)
  '/rider',
  '/rider/home',
  '/rider/browse(.*)',     // includes /rider/browse/blast (unauth-friendly blast landing)
  '/blast',                // Blast v3 unauth social-proof landing page (Stream A)
  '/rider/blast/new',      // the form itself; auth gate is on submit, not page load
  '/auth-callback/blast',  // post-Clerk handoff; renders mid-handshake for spinner state
  '/api/blast/estimate',   // pre-auth pricing estimate for the blast form
  '/api/blast',            // blast booking endpoint — auth checked in handler, returns 401 JSON if unauthorized
  '/api/partner/(.*)',     // partner API — API-key + HMAC auth enforced in-handler (lib/partner/auth.ts), not Clerk
  '/api/mobile/demo-signin',   // reviewer OTP bypass — called pre-auth, gated by fixed demo code in-handler
  '/api/mobile/provision-demo', // one-time demo provisioning — gated by DEMO_PROVISION_SECRET in-handler, not Clerk
  '/api/public/(.*)',
  '/api/rider/browse/(.*)',
  '/privacy',
  '/terms',
  '/about',
  '/team',
  '/careers',
  '/press',
  '/blog(.*)',
  '/faq',
  '/llms.txt',
  '/safety',
  '/safety/(.*)',
  '/pricing',
  '/help',
  '/support',
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
      const geo = readCfGeo();
      const market = geo ? nearestMarket(geo.lat, geo.lng) : null;
      const h = new Headers(req.headers);
      if (geo?.city) h.set('x-cf-city', geo.city);

      if (market?.redirect) {
        // ATL: redirect to its subdomain. Existing ATL users have sessions
        // scoped there, and atl.hmucashride.com is the Clerk primary domain.
        return NextResponse.redirect(
          `https://${market.slug}.hmucashride.com${path}${req.nextUrl.search}`,
          307,
        );
      } else if (market) {
        // In-market but no subdomain required (NOLA, and all future markets).
        // Stamp the market slug so layout/sign-up know which market this is.
        // Clerk satellite mode uses hmucashride.com as the domain — no per-market
        // subdomain or Clerk satellite config needed beyond the apex registration.
        h.set('x-market-slug', market.slug);
        return NextResponse.next({ request: { headers: h } });
      } else if (!geo) {
        // Geo unavailable (Cloudflare attached no lat/lng, or we're off-worker).
        // DON'T dead-end the visitor on the expansion waitlist — fail open to the
        // ATL flagship by redirecting to its subdomain, exactly as an in-ATL
        // detection would. Only a *confirmed* out-of-market point (geo present
        // but outside every radius, the branch below) should see the waitlist.
        return NextResponse.redirect(
          `https://atl.hmucashride.com${path}${req.nextUrl.search}`,
          307,
        );
      } else {
        // Out of every live market (Memphis, Dallas…): show waitlist page.
        h.set('x-market-slug', 'none');
        return NextResponse.next({ request: { headers: h } });
      }
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
