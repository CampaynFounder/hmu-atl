import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import sql from '../../../../../lib/db/client';
import { redis } from '../../../../../lib/notifications/redis';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:admin:disputes',
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
    const disputes = await sql`
      SELECT
        d.id,
        d.ride_id,
        d.filed_by,
        d.reason,
        d.status,
        d.ably_history_url,
        d.resolved_at,
        d.created_at,
        row_to_json(r)      AS ride,
        row_to_json(driver) AS driver_profile,
        row_to_json(rider)  AS rider_profile
      FROM disputes d
      JOIN rides r ON r.id = d.ride_id
      JOIN users driver ON driver.id = r.driver_id
      JOIN users rider  ON rider.id  = r.rider_id
      WHERE d.status = 'open'
      ORDER BY d.created_at ASC
    `;

    return NextResponse.json({ disputes });
  } catch (err) {
    console.error('[admin/disputes] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
