import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

/**
 * GET /api/driver/dashboard?view=today|week
 * Returns bookings with full ride + rider details for the driver dashboard.
 */
export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const driverId = (userRows[0] as { id: string }).id;

    const view = req.nextUrl.searchParams.get('view') || 'today';
    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date;

    if (view === 'week') {
      rangeStart = new Date(now); rangeStart.setDate(now.getDate() - now.getDay()); rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeEnd.getDate() + 7);
    } else {
      rangeStart = new Date(now); rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(rangeStart); rangeEnd.setDate(rangeEnd.getDate() + 1);
    }

    // Get bookings with ride + rider details
    const bookings = await sql`
      SELECT
        db.id as booking_id, db.booking_type, db.start_at, db.end_at, db.status as booking_status,
        db.title, db.created_at as booked_at,
        r.id as ride_id, r.status as ride_status, r.amount, r.final_agreed_price,
        r.add_on_total, r.is_cash, r.pickup_address, r.dropoff_address, r.stops,
        r.driver_payout_amount, r.platform_fee_amount,
        r.created_at as ride_created_at,
        rp.handle as rider_handle, rp.display_name as rider_name,
        rp.avatar_url as rider_avatar, rp.video_url as rider_video,
        u2.chill_score as rider_chill_score, u2.completed_rides as rider_completed_rides
      FROM driver_bookings db
      LEFT JOIN rides r ON r.id = db.ride_id
      LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
      LEFT JOIN users u2 ON u2.id = r.rider_id
      WHERE db.driver_id = ${driverId}
        AND db.status != 'cancelled'
        AND db.start_at < ${rangeEnd.toISOString()}
        AND db.end_at > ${rangeStart.toISOString()}
      ORDER BY db.start_at ASC
    `;

    // Get last viewed timestamp for new booking indicator
    const lastViewedRows = await sql`
      SELECT details->>'lastDashboardView' as last_view
      FROM schedule_events
      WHERE driver_id = ${driverId} AND event_type = 'dashboard_viewed'
      ORDER BY created_at DESC LIMIT 1
    `;
    const lastViewed = (lastViewedRows[0] as Record<string, unknown>)?.last_view as string || null;

    // Log this dashboard view
    await sql`
      INSERT INTO schedule_events (driver_id, event_type, details)
      VALUES (${driverId}, 'dashboard_viewed', ${JSON.stringify({ lastDashboardView: now.toISOString(), view })}::jsonb)
    `.catch(() => {});

    // Summary stats
    const todayBookings = bookings.filter((b: Record<string, unknown>) => {
      const start = new Date(b.start_at as string);
      return start.toDateString() === now.toDateString();
    });

    const result = bookings.map((b: Record<string, unknown>) => ({
      bookingId: b.booking_id,
      bookingType: b.booking_type,
      startAt: b.start_at,
      endAt: b.end_at,
      bookingStatus: b.booking_status,
      title: b.title,
      isNew: lastViewed ? new Date(b.booked_at as string) > new Date(lastViewed) : false,
      ride: b.ride_id ? {
        id: b.ride_id,
        status: b.ride_status,
        price: Number(b.final_agreed_price || b.amount || 0),
        addOns: Number(b.add_on_total || 0),
        isCash: b.is_cash,
        pickup: b.pickup_address,
        dropoff: b.dropoff_address,
        stops: b.stops,
        payout: Number(b.driver_payout_amount || 0),
        platformFee: Number(b.platform_fee_amount || 0),
        createdAt: b.ride_created_at,
      } : null,
      rider: b.rider_handle ? {
        handle: b.rider_handle,
        name: b.rider_name,
        avatar: b.rider_avatar,
        video: b.rider_video,
        chillScore: Number(b.rider_chill_score || 0),
        completedRides: Number(b.rider_completed_rides || 0),
      } : null,
    }));

    return NextResponse.json({
      view,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      bookings: result,
      summary: {
        total: bookings.length,
        today: todayBookings.length,
        rides: bookings.filter((b: Record<string, unknown>) => b.booking_type === 'ride').length,
        blocked: bookings.filter((b: Record<string, unknown>) => b.booking_type === 'blocked').length,
        newSinceLastView: lastViewed ? bookings.filter((b: Record<string, unknown>) => new Date(b.booked_at as string) > new Date(lastViewed)).length : 0,
      },
    });
  } catch (error) {
    console.error('Driver dashboard error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
