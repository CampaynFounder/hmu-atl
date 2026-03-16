// Get Current User Helper
// Returns full Neon user record for authenticated Clerk user

import { currentUser } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/db/users';
import type { User } from '@/lib/db/types';

/**
 * Get the current authenticated user from Neon database
 * Returns null if user is not authenticated or not found in Neon
 *
 * Usage in Server Components:
 * ```tsx
 * const user = await getCurrentUser();
 * if (!user) redirect('/sign-in');
 * ```
 *
 * Usage in Route Handlers:
 * ```tsx
 * const user = await getCurrentUser();
 * if (!user) return new Response('Unauthorized', { status: 401 });
 * ```
 */
export async function getCurrentUser(): Promise<User | null> {
  // Get Clerk user
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return null;
  }

  // Get Neon user record
  const user = await getUserByClerkId(clerkUser.id);
  return user;
}
