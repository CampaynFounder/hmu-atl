import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { rating } = await req.json();

    const validRatings = ['chill', 'cool_af', 'kinda_creepy', 'weirdo'];
    if (!validRatings.includes(rating)) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT driver_id, rider_id, status FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.status !== 'ended' && ride.status !== 'completed') {
      return NextResponse.json({ error: 'Ride must be ended to rate' }, { status: 400 });
    }

    // Determine who is rating whom
    if (userId === ride.rider_id) {
      // Rider rating driver
      await sql`UPDATE rides SET driver_rating = ${rating}, rider_auto_rated = false, updated_at = NOW() WHERE id = ${rideId}`;
      // Also insert into ratings table
      await sql`
        INSERT INTO ratings (ride_id, rater_id, rated_id, rating_type)
        VALUES (${rideId}, ${userId}, ${ride.driver_id}, ${rating})
        ON CONFLICT (ride_id, rater_id) DO UPDATE SET rating_type = ${rating}
      `;
    } else if (userId === ride.driver_id) {
      // Driver rating rider
      await sql`UPDATE rides SET rider_rating = ${rating}, updated_at = NOW() WHERE id = ${rideId}`;
      await sql`
        INSERT INTO ratings (ride_id, rater_id, rated_id, rating_type)
        VALUES (${rideId}, ${userId}, ${ride.rider_id}, ${rating})
        ON CONFLICT (ride_id, rater_id) DO UPDATE SET rating_type = ${rating}
      `;
    } else {
      return NextResponse.json({ error: 'Not part of this ride' }, { status: 403 });
    }

    return NextResponse.json({ success: true, rating });
  } catch (error) {
    console.error('Rate error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
