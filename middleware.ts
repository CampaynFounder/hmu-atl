// Middleware for Route Protection
// Handles Clerk authentication and route-based authorization

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define public routes (accessible without authentication)
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/auth-callback(.*)',
  '/api/webhooks(.*)',
  '/api/meta-verify',
  '/d/(.*)',
  '/api/drivers/:handle',
  '/api/og/(.*)',
  '/driver',
  '/rider',
  '/rider/home',
  '/privacy',
  '/terms',
  '/about',
  '/team',
  '/careers',
  '/press',
  '/blog',
  '/safety',
  '/pricing',
  '/help',
  '/guidelines',
  '/cookies',
  '/contact',
  '/guide/(.*)',
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
  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return;
  }

  // Check if authenticated — redirect to our own sign-in page if not
  // (avoid Clerk's default redirect which may use accounts.* subdomain)
  const { userId } = await auth();
  if (!userId) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
