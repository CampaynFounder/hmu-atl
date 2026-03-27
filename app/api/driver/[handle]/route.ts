import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { handle } = await params;

    const rows = await sql`
      SELECT
        dp.display_name,
        dp.handle,
        dp.thumbnail_url,
        dp.video_url,
        dp.areas,
        dp.pricing,
        dp.vehicle_info,
        dp.created_at,
        dp.accepts_cash,
        dp.cash_only,
        u.id as user_id,
        u.tier,
        u.chill_score,
        u.completed_rides,
        u.og_status,
        u.account_status
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.handle = ${handle}
        AND u.account_status = 'active'
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const d = rows[0] as Record<string, unknown>;

    // Fetch ratings, services, response stats, and disputes in parallel
    const [ratingRows, serviceRows, responseRows, disputeRows] = await Promise.all([
      sql`
        SELECT rating_type, COUNT(*)::int as count
        FROM ratings
        WHERE rated_id = ${d.user_id}
        GROUP BY rating_type
      `,
      sql`
        SELECT COALESCE(dsm.custom_name, smi.name) as name,
          COALESCE(dsm.custom_icon, smi.icon) as icon,
          dsm.price, dsm.pricing_type
        FROM driver_service_menu dsm
        LEFT JOIN service_menu_items smi ON dsm.item_id = smi.id
        WHERE dsm.driver_id = ${d.user_id} AND dsm.is_active = true
        ORDER BY dsm.sort_order LIMIT 8
      `,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
          COUNT(*) FILTER (WHERE status = 'cancelled' AND driver_id = ${d.user_id})::int as cancelled
        FROM rides
        WHERE driver_id = ${d.user_id}
      `,
      sql`
        SELECT COUNT(*)::int as count FROM disputes
        WHERE filed_by != ${d.user_id}
          AND ride_id IN (SELECT id FROM rides WHERE driver_id = ${d.user_id})
      `,
    ]);

    const ratings: Record<string, number> = {};
    let totalRatings = 0;
    for (const row of ratingRows as Array<{ rating_type: string; count: number }>) {
      ratings[row.rating_type] = row.count;
      totalRatings += row.count;
    }

    const stats = responseRows[0] as { completed: number; cancelled: number } | undefined;
    const disputeCount = Number((disputeRows[0] as Record<string, unknown>)?.count ?? 0);

    const vehicleInfo = d.vehicle_info as Record<string, unknown> | null;
    const pricing = d.pricing as Record<string, unknown> | null;

    return NextResponse.json({
      displayName: d.display_name || 'Driver',
      handle: d.handle,
      avatarUrl: d.thumbnail_url || null,
      videoUrl: d.video_url || null,
      areas: Array.isArray(d.areas) ? d.areas : [],
      isHmuFirst: d.tier === 'hmu_first',
      chillScore: Number(d.chill_score ?? 0),
      completedRides: Number(d.completed_rides ?? 0),
      disputeCount,
      memberSince: d.created_at,
      ratings,
      totalRatings,
      acceptsCash: (d.accepts_cash as boolean) || (d.cash_only as boolean) || false,
      cashOnly: (d.cash_only as boolean) || false,
      vehicle: vehicleInfo ? {
        label: [vehicleInfo.year, vehicleInfo.make, vehicleInfo.model].filter(Boolean).join(' '),
        photoUrl: (vehicleInfo.photo_url as string) || null,
        maxRiders: (Number(vehicleInfo.max_adults || 0) + Number(vehicleInfo.max_children || 0)) || null,
      } : null,
      pricing: {
        minimum: Number(pricing?.minimum ?? 0),
        thirtyMin: Number(pricing?.['30min'] ?? 0),
        hourly: Number(pricing?.hourly ?? 0),
      },
      services: serviceRows.map((s: Record<string, unknown>) => ({
        name: s.name as string,
        icon: s.icon as string,
        price: Number(s.price ?? 0),
        pricingType: (s.pricing_type as string) || 'flat',
      })),
      completionRate: stats && (stats.completed + stats.cancelled) > 0
        ? Math.round((stats.completed / (stats.completed + stats.cancelled)) * 100)
        : 100,
    });
  } catch (error) {
    console.error('Driver profile overlay error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
