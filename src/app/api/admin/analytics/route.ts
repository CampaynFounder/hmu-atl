import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import sql from '../../../../../lib/db/client';
import { redis } from '../../../../../lib/notifications/redis';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:admin:analytics',
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
    // Revenue by tier (sum platform fees grouped by driver tier)
    const revenueByTier = await sql`
      SELECT
        u.tier,
        COALESCE(SUM(p.fee), 0) AS total_platform_fees,
        COUNT(p.id)             AS payout_count
      FROM payouts p
      JOIN users u ON u.id = p.driver_id
      GROUP BY u.tier
    `;

    // Ride volume last 7 and 30 days
    const rideVolume = await sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS rides_last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS rides_last_30_days
      FROM rides
      WHERE status NOT IN ('cancelled')
    `;

    // Dispute rate: disputes / completed rides
    const disputeRate = await sql`
      SELECT
        (
          SELECT COUNT(*) FROM disputes
          WHERE created_at >= NOW() - INTERVAL '30 days'
        ) AS dispute_count,
        (
          SELECT COUNT(*) FROM rides
          WHERE status = 'completed'
            AND created_at >= NOW() - INTERVAL '30 days'
        ) AS completed_ride_count
    `;

    // Active drivers and riders
    const activeCounts = await sql`
      SELECT
        COUNT(*) FILTER (WHERE profile_type IN ('driver', 'both')) AS active_drivers,
        COUNT(*) FILTER (WHERE profile_type IN ('rider', 'both'))  AS active_riders
      FROM users
      WHERE account_status = 'active'
    `;

    // HMU First conversion rate: hmu_first users / total active users
    const conversionRate = await sql`
      SELECT
        COUNT(*) FILTER (WHERE tier = 'hmu_first') AS hmu_first_count,
        COUNT(*)                                    AS total_active_users
      FROM users
      WHERE account_status = 'active'
    `;

    const disputes = (disputeRate[0] as { dispute_count: string; completed_ride_count: string }) ?? { dispute_count: '0', completed_ride_count: '0' };
    const completedRides = parseInt(disputes.completed_ride_count, 10);
    const disputeCount = parseInt(disputes.dispute_count, 10);
    const rate = completedRides > 0 ? disputeCount / completedRides : 0;

    const conv = (conversionRate[0] as { hmu_first_count: string; total_active_users: string }) ?? { hmu_first_count: '0', total_active_users: '0' };
    const totalActive = parseInt(conv.total_active_users, 10);
    const hmuFirst = parseInt(conv.hmu_first_count, 10);
    const hmuFirstRate = totalActive > 0 ? hmuFirst / totalActive : 0;

    return NextResponse.json({
      revenue_by_tier:    revenueByTier,
      ride_volume:        rideVolume[0] ?? { rides_last_7_days: 0, rides_last_30_days: 0 },
      dispute_rate: {
        dispute_count:        disputeCount,
        completed_ride_count: completedRides,
        rate:                 rate,
      },
      active_counts:      activeCounts[0] ?? { active_drivers: 0, active_riders: 0 },
      hmu_first_conversion: {
        hmu_first_count:    hmuFirst,
        total_active_users: totalActive,
        rate:               hmuFirstRate,
      },
    });
  } catch (err) {
    console.error('[admin/analytics] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
