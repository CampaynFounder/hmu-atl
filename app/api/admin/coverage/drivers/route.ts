import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin } from '@/lib/admin/helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const marketId = searchParams.get('marketId');

  const rows = await sql`
    SELECT
      u.id                                          AS user_id,
      dp.id                                         AS driver_id,
      COALESCE(dp.display_name, dp.first_name, '')  AS name,
      dp.phone,
      dp.handle,
      dp.home_lat::float8                           AS home_lat,
      dp.home_lng::float8                           AS home_lng,
      dp.home_label,
      dp.home_updated_at,
      COALESCE(dp.stripe_onboarding_complete, false) AS payment_ready,
      COALESCE(dp.profile_visible, true)            AS profile_visible,
      u.market_id,
      COALESCE(u.completed_rides, 0)::int           AS completed_rides,
      u.account_status,
      m.slug                                        AS market_slug
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.profile_type = 'driver'
      AND u.account_status != 'deleted'
      AND (${marketId}::text IS NULL OR u.market_id::text = ${marketId})
    ORDER BY (dp.home_lat IS NULL) DESC, name ASC
  `;

  const drivers = rows.map((r: Record<string, unknown>) => ({
    userId: r.user_id as string,
    driverId: r.driver_id as string,
    name: r.name as string,
    phone: (r.phone as string | null) ?? null,
    handle: (r.handle as string | null) ?? null,
    homeLat: r.home_lat != null ? (r.home_lat as number) : null,
    homeLng: r.home_lng != null ? (r.home_lng as number) : null,
    homeLabel: (r.home_label as string | null) ?? null,
    homeUpdatedAt: r.home_updated_at ? String(r.home_updated_at) : null,
    paymentReady: Boolean(r.payment_ready),
    profileVisible: Boolean(r.profile_visible),
    marketId: (r.market_id as string | null) ?? null,
    marketSlug: (r.market_slug as string | null) ?? 'atl',
    completedRides: r.completed_rides as number,
    accountStatus: r.account_status as string,
  }));

  return NextResponse.json({ drivers });
}
