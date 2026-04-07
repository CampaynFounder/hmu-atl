import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

/** GET /api/users/me — resolve Clerk ID to internal user ID + profile type */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT id, profile_type, account_status FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const user = rows[0] as { id: string; profile_type: string; account_status: string };
  return NextResponse.json({ id: user.id, profileType: user.profile_type, accountStatus: user.account_status });
}
