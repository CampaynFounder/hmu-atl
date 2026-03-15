import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type RouteHandler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>;

/**
 * Wraps a Next.js API route handler with Clerk auth enforcement.
 * Returns 401 if the request has no valid Clerk session.
 *
 * Usage:
 *   export const GET = withAuth(async (req) => { ... });
 */
export function withAuth(handler: RouteHandler): RouteHandler {
  return async function (req: NextRequest, ctx?: unknown): Promise<NextResponse> {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(req, ctx);
  };
}
