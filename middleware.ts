// Middleware for Route Protection
// Handles Clerk authentication and route-based authorization

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define public routes (accessible without authentication)
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/d/(.*)',
  '/api/drivers/:handle',
  '/driver',
  '/rider',
]);

// Define pending-only routes (only for pending_activation users)
const isPendingRoute = createRouteMatcher(['/pending']);

// Define protected routes that require active status
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/profile(.*)',
  '/rides(.*)',
  '/driver(.*)',
  '/rider(.*)',
  '/hmu(.*)',
  '/payouts(.*)',
  '/settings(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return;
  }

  // Protect all other routes - require authentication
  await auth.protect();

  // Note: Account status checks (pending_activation, active, suspended, banned)
  // are handled by server components using requireAccountStatus() guard
  // This middleware only ensures the user is authenticated via Clerk
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
