import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import sql from '../../../../../../lib/db/client';
import { redis } from '../../../../../../lib/notifications/redis';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:admin:accounts:pending',
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
    const users = await sql`
      SELECT
        u.id,
        u.clerk_id,
        u.profile_type,
        u.account_status,
        u.tier,
        u.og_status,
        u.chill_score,
        u.created_at,
        dp.vehicle_info,
        dp.areas,
        dp.pricing,
        -- video_intro_url stored as a driver_profile JSONB extension
        (dp.vehicle_info->>'video_intro_url') AS video_intro_url
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.account_status = 'pending_activation'
      ORDER BY u.created_at ASC
    `;

    return NextResponse.json({ users });
  } catch (err) {
    console.error('[admin/accounts/pending] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
