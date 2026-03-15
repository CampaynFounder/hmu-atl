import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import sql from '../db/client';
import type { User, UserType } from '../db/types';

/**
 * Returns the Neon user record for the currently authenticated Clerk session.
 * Returns null if not authenticated or if no matching user record exists.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const rows = await sql`
    SELECT *
    FROM users
    WHERE auth_provider_id = ${userId}
      AND is_active = true
    LIMIT 1
  `;
  return (rows[0] as User) ?? null;
}

/**
 * Route guard factory. Returns a middleware function that rejects requests
 * whose authenticated user does not hold one of the required roles.
 *
 * Usage (in a route handler):
 *   const guard = requireRole('driver', 'both');
 *   const rejection = await guard(req);
 *   if (rejection) return rejection;
 *
 * A user with user_type === 'both' satisfies any single-role requirement.
 */
export function requireRole(...roles: UserType[]) {
  return async function guard(req: NextRequest): Promise<NextResponse | null> {
    // Suppress unused-variable warning — req is required by the signature contract.
    void req;

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await sql`
      SELECT user_type
      FROM users
      WHERE auth_provider_id = ${userId}
        AND is_active = true
      LIMIT 1
    `;

    const user = rows[0] as Pick<User, 'user_type'> | undefined;
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 403 });
    }

    const allowed =
      roles.includes(user.user_type) ||
      user.user_type === 'both';

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return null; // allow
  };
}
