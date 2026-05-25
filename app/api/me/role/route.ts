import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

// GET /api/me/role
// Returns the authenticated user's profile_type from Neon.
// Also backfills Clerk publicMetadata.profileType if it was never written —
// this permanently fixes accounts created before the webhook set it, so
// subsequent loads read from Clerk without hitting this endpoint again.
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const profileType = (rows[0] as { profile_type: string }).profile_type;

  // Backfill: if Clerk metadata is missing profileType, write it now.
  // updateUserMetadata is a merge — existing keys are preserved.
  try {
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(clerkId);
    if (!clerkUser.publicMetadata?.profileType) {
      await clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: { profileType },
      });
    }
  } catch {
    // Non-fatal — UI still gets profileType from the Neon row
  }

  return NextResponse.json({ profileType });
}
