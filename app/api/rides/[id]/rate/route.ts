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
    const body = await req.json();
    const rating = body.rating || body.rating_type;

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
    const ratedUserId = userId === ride.rider_id ? ride.driver_id : userId === ride.driver_id ? ride.rider_id : null;
    if (!ratedUserId) {
      return NextResponse.json({ error: 'Not part of this ride' }, { status: 403 });
    }

    // Update ride record with rating
    if (userId === ride.rider_id) {
      await sql`UPDATE rides SET driver_rating = ${rating}, rider_auto_rated = false, updated_at = NOW() WHERE id = ${rideId}`;
    } else {
      await sql`UPDATE rides SET rider_rating = ${rating}, updated_at = NOW() WHERE id = ${rideId}`;
    }

    // Insert into ratings table (non-blocking — don't let this fail the whole request)
    try {
      await sql`
        INSERT INTO ratings (ride_id, rater_id, rated_id, rating_type)
        VALUES (${rideId}, ${userId}, ${ratedUserId}, ${rating})
        ON CONFLICT (ride_id, rater_id) DO UPDATE SET rating_type = ${rating}
      `;
    } catch (e) {
      console.error('Ratings table insert failed:', e);
    }

    // Move ride to completed after any rating
    if (ride.status === 'ended') {
      await sql`UPDATE rides SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = ${rideId}`;

      // Increment completed_rides for both driver and rider
      try {
        await sql`UPDATE users SET completed_rides = COALESCE(completed_rides, 0) + 1 WHERE id IN (${ride.driver_id}, ${ride.rider_id})`;
      } catch (e) {
        console.error('Failed to increment completed_rides:', e);
      }

      // Recalculate chill_score for the rated user
      try {
        await sql`
          UPDATE users SET chill_score = COALESCE((
            SELECT ROUND(
              ((COUNT(*) FILTER (WHERE rating_type = 'chill') + COUNT(*) FILTER (WHERE rating_type = 'cool_af') * 1.5)
              / GREATEST(COUNT(*), 1)) * 100
            , 2)
            FROM ratings WHERE rated_id = ${ratedUserId}
          ), 0)
          WHERE id = ${ratedUserId}
        `;
      } catch (e) {
        console.error('Failed to recalculate chill_score:', e);
      }
    }

    // Also mark the associated hmu_post as completed
    try {
      await sql`
        UPDATE hmu_posts SET status = 'completed', updated_at = NOW()
        WHERE id = (SELECT hmu_post_id FROM rides WHERE id = ${rideId} AND hmu_post_id IS NOT NULL)
      `;
    } catch (e) {
      console.error('Failed to update hmu_post status:', e);
    }

    return NextResponse.json({ success: true, rating, status: 'completed' });
  } catch (error) {
    console.error('Rate error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
