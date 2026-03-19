import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { postId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const driverUserId = (userRows[0] as { id: string }).id;

    const postRows = await sql`
      SELECT * FROM hmu_posts
      WHERE id = ${postId}
        AND status = 'active'
        AND (
          (post_type = 'direct_booking' AND target_driver_id = ${driverUserId} AND booking_expires_at > NOW())
          OR
          (post_type = 'rider_request' AND expires_at > NOW())
        )
      LIMIT 1
    `;

    if (!postRows.length) {
      return NextResponse.json({ error: 'Request not found or expired' }, { status: 404 });
    }

    const post = postRows[0] as Record<string, unknown>;
    const riderId = post.user_id as string;
    const price = Number(post.price || 0);
    const timeWindow = (post.time_window || {}) as Record<string, unknown>;
    const areas = (post.areas || []) as string[];

    // Update post status
    await sql`UPDATE hmu_posts SET status = 'matched' WHERE id = ${postId}`;

    // Create ride record
    const rideRows = await sql`
      INSERT INTO rides (
        driver_id, rider_id, status, amount, final_agreed_price,
        price_mode, proposed_price, price_accepted_at,
        hmu_post_id, agreement_summary,
        dispute_window_minutes
      ) VALUES (
        ${driverUserId}, ${riderId}, 'matched', ${price}, ${price},
        'proposed', ${price}, NOW(),
        ${postId}, ${JSON.stringify({
          destination: timeWindow.destination || timeWindow.note || '',
          time: timeWindow.time || 'ASAP',
          stops: timeWindow.stops || 'none',
          roundTrip: timeWindow.round_trip === true,
          areas,
          price,
        })}::jsonb,
        ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '15')}
      )
      RETURNING id
    `;

    const rideId = (rideRows[0] as { id: string }).id;

    // Notify rider via Ably
    await notifyUser(riderId, 'booking_accepted', {
      rideId,
      postId,
      driverUserId,
      price,
      message: 'Your ride request was accepted!',
    }).catch(() => {});

    await publishRideUpdate(rideId, 'status_change', {
      status: 'matched',
      message: 'Ride matched — driver will be OTW soon',
    }).catch(() => {});

    return NextResponse.json({ status: 'matched', rideId });
  } catch (error) {
    console.error('Accept booking error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to accept';
    // Include more detail for debugging
    return NextResponse.json(
      { error: msg, detail: String(error) },
      { status: 500 }
    );
  }
}
