// Middleware for Route Protection
// Handles Clerk authentication and route-based authorization

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// ============================================================
// MAINTENANCE MODE — set to true to redirect auth routes
// ============================================================
const MAINTENANCE_MODE = false;
// ============================================================

// Routes that stay up during maintenance (marketing, legal, data room)
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
  '/d/(.*)',
  '/api/og/(.*)',
  '/api/webhooks(.*)',
  '/api/meta-verify',
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
  '/d/(.*)',
  '/api/drivers/:handle',
  '/api/chat/booking',
  '/api/chat/support',
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
  // MAINTENANCE MODE: redirect non-exempt routes to maintenance page
  if (MAINTENANCE_MODE && !isMaintenanceExempt(req)) {
    return NextResponse.redirect(new URL('/maintenance', req.url));
  }

  // Allow public routes without authentication
  if (isPublicRoute(req)) {
    return;
  }

  // Protect all other routes — redirect to our sign-in page if not authenticated
  await auth.protect({
    unauthenticatedUrl: new URL('/sign-in', req.url).toString(),
  });
});

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and .well-known
    '/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
