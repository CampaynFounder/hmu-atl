import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import sql from '../../../../../../lib/db/client';
import { redis } from '../../../../../../lib/notifications/redis';
import type { Ride, RideLocation } from '../../../../../../lib/db/types';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:admin:rides:live',
});

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { success } = await ratelimit.limit(userId);
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.publicMetadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rejection = await requireAdmin(req);
  if (rejection) return rejection;

  try {
    const rides = await sql`
      SELECT
        r.*,
        rl.lat       AS last_lat,
        rl.lng       AS last_lng,
        rl.recorded_at AS last_recorded_at
      FROM rides r
      LEFT JOIN LATERAL (
        SELECT lat, lng, recorded_at
        FROM ride_locations
        WHERE ride_id = r.id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) rl ON true
      WHERE r.status IN ('otw', 'here', 'active')
      ORDER BY r.created_at DESC
    `;

    return NextResponse.json({ rides });
  } catch (err) {
    console.error('[admin/rides/live] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
