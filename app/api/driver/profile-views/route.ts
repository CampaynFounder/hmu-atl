// Driver-side read of their own view stats + viewer list.
//   GET /api/driver/profile-views          → { stats, viewers }
//   GET /api/driver/profile-views?stats=1  → { stats }            (cheap)
//   GET /api/driver/profile-views?list=1   → { viewers }          (page)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getDriverViewStats, listDriverViewers } from '@/lib/profile-views/track';

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  const user = userRows[0] as { id: string; profile_type: string } | undefined;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.profile_type !== 'driver' && user.profile_type !== 'both') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = request.nextUrl;
  const onlyStats = url.searchParams.get('stats') === '1';
  const onlyList = url.searchParams.get('list') === '1';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

  const wantStats = onlyStats || (!onlyStats && !onlyList);
  const wantList = onlyList || (!onlyStats && !onlyList);

  const [stats, viewers] = await Promise.all([
    wantStats ? getDriverViewStats(user.id) : Promise.resolve(null),
    wantList ? listDriverViewers(user.id, limit) : Promise.resolve(null),
  ]);

  return NextResponse.json({ stats, viewers });
}
