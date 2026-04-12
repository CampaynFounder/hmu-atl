import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const user = userRows[0] as { id: string; profile_type: string };

    const isDriver = user.profile_type === 'driver';

    const rides = await sql`
      SELECT
        r.id,
        r.ref_code,
        r.status,
        r.amount,
        r.final_agreed_price,
        r.driver_payout_amount,
        r.platform_fee_amount,
        r.driver_rating,
        r.rider_rating,
        r.pickup,
        r.dropoff,
        r.pickup_address,
        r.dropoff_address,
        r.is_cash,
        r.created_at,
        r.started_at,
        r.ended_at,
        r.dispute_window_expires_at,
        dp.display_name as driver_name,
        dp.handle as driver_handle,
        rp.first_name as rider_name,
        rp.handle as rider_handle,
        hp.time_window
      FROM rides r
      LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
      LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
      LEFT JOIN hmu_posts hp ON hp.id = r.hmu_post_id
      WHERE ${isDriver ? sql`r.driver_id = ${user.id}` : sql`r.rider_id = ${user.id}`}
      ORDER BY r.created_at DESC
      LIMIT 50
    `;

    const mapped = rides.map((r: Record<string, unknown>) => {
      const tw = r.time_window as Record<string, unknown> | null;
      const pickup = r.pickup as Record<string, unknown> | null;
      const dropoff = r.dropoff as Record<string, unknown> | null;
      const pickupAddr = (pickup?.address as string) || (pickup?.name as string) || null;
      const dropoffAddr = (dropoff?.address as string) || (dropoff?.name as string) || null;
      return {
        id: r.id,
        ref_code: r.ref_code || null,
        status: r.status,
        amount: Number(r.amount || 0),
        final_agreed_price: r.final_agreed_price ? Number(r.final_agreed_price) : null,
        driver_payout_amount: r.driver_payout_amount ? Number(r.driver_payout_amount) : null,
        platform_fee_amount: r.platform_fee_amount ? Number(r.platform_fee_amount) : null,
        driver_rating: r.driver_rating,
        rider_rating: r.rider_rating,
        driver_name: r.driver_name || null,
        driver_handle: r.driver_handle || null,
        rider_name: r.rider_name || null,
        rider_handle: r.rider_handle || null,
        pickup_address: (r.pickup_address as string) || pickupAddr,
        dropoff_address: (r.dropoff_address as string) || dropoffAddr,
        destination: (tw?.destination as string) || (r.dropoff_address as string) || dropoffAddr,
        is_cash: r.is_cash ?? false,
        created_at: r.created_at,
        started_at: r.started_at,
        ended_at: r.ended_at,
        dispute_window_expires_at: r.dispute_window_expires_at || null,
      };
    });

    return NextResponse.json({ rides: mapped });
  } catch (error) {
    console.error('Ride history error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
