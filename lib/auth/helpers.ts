import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import sql from '../db/client';
import type { User, ProfileType } from '../db/types';

/**
 * Returns the Neon user record for the currently authenticated Clerk session.
 * Returns null if not authenticated or if no matching user record exists.
 * Suspended/banned accounts are treated as non-existent.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const rows = await sql`
    SELECT *
    FROM users
    WHERE clerk_id = ${userId}
      AND account_status NOT IN ('suspended', 'banned')
    LIMIT 1
  `;
  return (rows[0] as User) ?? null;
}

/**
 * Route guard factory. Returns a guard function that rejects requests whose
 * authenticated user does not hold one of the required profile types.
 *
 * A user with profile_type === 'both' satisfies any single-role requirement.
 *
 * Usage (in a route handler):
 *   const rejection = await requireRole('driver')(req);
 *   if (rejection) return rejection;
 */
export function requireRole(...roles: (ProfileType | 'admin')[]) {
  return async function guard(req: NextRequest): Promise<NextResponse | null> {
    void req;

    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await sql`
      SELECT profile_type, account_status
      FROM users
      WHERE clerk_id = ${userId}
      LIMIT 1
    `;

    const user = rows[0] as Pick<User, 'profile_type' | 'account_status'> | undefined;
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 403 });
    }

    if (user.account_status === 'suspended' || user.account_status === 'banned') {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    const profileRoles = roles.filter((r): r is ProfileType => r !== 'admin');
    const allowed =
      profileRoles.length === 0 ||
      profileRoles.includes(user.profile_type) ||
      user.profile_type === 'both';

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return null;
  };
}
