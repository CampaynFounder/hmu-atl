// GET /api/admin/alerts — Active alerts for ops dashboard
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');

  const [staleRides, newDisputes, weirdo3x] = await Promise.all([
    // Stale GPS — driver hasn't updated location in >90s during active ride.
    // Market-filtered via r.market_id when provided.
    marketId
      ? sql`
          SELECT r.id, r.status,
            COALESCE(dp.display_name, dp.first_name) as driver_name,
            rl.recorded_at as last_gps
          FROM rides r
          LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
          LEFT JOIN LATERAL (
            SELECT recorded_at FROM ride_locations
            WHERE ride_id = r.id ORDER BY recorded_at DESC LIMIT 1
          ) rl ON true
          WHERE r.status IN ('otw', 'here', 'confirming', 'active')
            AND (rl.recorded_at IS NULL OR rl.recorded_at < NOW() - INTERVAL '90 seconds')
            AND r.created_at > NOW() - INTERVAL '24 hours'
            AND r.market_id = ${marketId}
          LIMIT 20
        `
      : sql`
          SELECT r.id, r.status,
            COALESCE(dp.display_name, dp.first_name) as driver_name,
            rl.recorded_at as last_gps
          FROM rides r
          LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
          LEFT JOIN LATERAL (
            SELECT recorded_at FROM ride_locations
            WHERE ride_id = r.id ORDER BY recorded_at DESC LIMIT 1
          ) rl ON true
          WHERE r.status IN ('otw', 'here', 'confirming', 'active')
            AND (rl.recorded_at IS NULL OR rl.recorded_at < NOW() - INTERVAL '90 seconds')
            AND r.created_at > NOW() - INTERVAL '24 hours'
          LIMIT 20
        `,
    // Recent disputes (< 1 hour). Market-scoped via the rides JOIN.
    marketId
      ? sql`
          SELECT d.id, d.ride_id, d.status, d.created_at,
            COALESCE(rp.display_name, rp.first_name) as filed_by_rider,
            COALESCE(dp.display_name, dp.first_name) as filed_by_driver
          FROM disputes d
          LEFT JOIN rides r ON r.id = d.ride_id
          LEFT JOIN rider_profiles rp ON rp.user_id = d.filed_by
          LEFT JOIN driver_profiles dp ON dp.user_id = d.filed_by
          WHERE d.created_at > NOW() - INTERVAL '1 hour'
            AND d.status = 'open'
            AND r.market_id = ${marketId}
          ORDER BY d.created_at DESC
          LIMIT 10
        `
      : sql`
          SELECT d.id, d.ride_id, d.status, d.created_at,
            COALESCE(rp.display_name, rp.first_name) as filed_by_rider,
            COALESCE(dp.display_name, dp.first_name) as filed_by_driver
          FROM disputes d
          LEFT JOIN rider_profiles rp ON rp.user_id = d.filed_by
          LEFT JOIN driver_profiles dp ON dp.user_id = d.filed_by
          WHERE d.created_at > NOW() - INTERVAL '1 hour'
            AND d.status = 'open'
          ORDER BY d.created_at DESC
          LIMIT 10
        `,
    // WEIRDO x3 flags. Ratings table has no market_id — scope via the rated user's market.
    marketId
      ? sql`
          SELECT ratings.rated_id, COUNT(*) as weirdo_count,
            MAX(ratings.created_at) as last_flag
          FROM ratings
          JOIN users u ON u.id = ratings.rated_id
          WHERE ratings.rating_type = 'weirdo'
            AND ratings.created_at > NOW() - INTERVAL '30 days'
            AND u.market_id = ${marketId}
          GROUP BY ratings.rated_id
          HAVING COUNT(*) >= 3
          LIMIT 10
        `
      : sql`
          SELECT rated_id, COUNT(*) as weirdo_count,
            MAX(created_at) as last_flag
          FROM ratings
          WHERE rating_type = 'weirdo'
            AND created_at > NOW() - INTERVAL '30 days'
          GROUP BY rated_id
          HAVING COUNT(*) >= 3
          LIMIT 10
        `,
  ]);

  const alerts = [];

  for (const ride of staleRides) {
    alerts.push({
      type: 'stale_gps',
      severity: 'warning',
      message: `${ride.driver_name ?? 'Driver'} — GPS stale on ride ${(ride.id as string).slice(0, 8)}`,
      rideId: ride.id,
      timestamp: ride.last_gps ?? new Date().toISOString(),
    });
  }

  for (const dispute of newDisputes) {
    alerts.push({
      type: 'new_dispute',
      severity: 'high',
      message: `New dispute filed by ${dispute.filed_by_rider || dispute.filed_by_driver || 'user'} on ride ${(dispute.ride_id as string).slice(0, 8)}`,
      disputeId: dispute.id,
      rideId: dispute.ride_id,
      timestamp: dispute.created_at,
    });
  }

  for (const flag of weirdo3x) {
    alerts.push({
      type: 'weirdo_3x',
      severity: 'critical',
      message: `User flagged WEIRDO ${flag.weirdo_count}x — needs review`,
      userId: flag.rated_id,
      timestamp: flag.last_flag,
    });
  }

  const severityOrder: Record<string, number> = { critical: 0, high: 1, warning: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return NextResponse.json({ alerts });
}
