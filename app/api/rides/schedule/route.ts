// Ride Scheduling API
// Create and manage scheduled rides

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

// POST - Create a new scheduled ride
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      pickup_location,
      pickup_lat,
      pickup_lng,
      dropoff_location,
      dropoff_lat,
      dropoff_lng,
      scheduled_time,
      estimated_distance,
      estimated_duration,
      estimated_price,
      rider_notes,
      preferred_driver_id,
    } = body;

    // Validate required fields
    if (!pickup_location || !pickup_lat || !pickup_lng ||
        !dropoff_location || !dropoff_lat || !dropoff_lng ||
        !scheduled_time) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get rider's user ID
    const userResult = await sql`
      SELECT id, profile_type FROM users
      WHERE clerk_id = ${clerkId}
      LIMIT 1
    `;

    if (userResult.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userResult[0];

    // Verify user is a rider
    if (user.profile_type !== 'rider' && user.profile_type !== 'both') {
      return NextResponse.json(
        { error: 'User is not a rider' },
        { status: 403 }
      );
    }

    const riderId = user.id;

    // Validate scheduled time is in the future
    const scheduledDate = new Date(scheduled_time);
    if (scheduledDate <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      );
    }

    // Create the scheduled ride
    const result = await sql`
      INSERT INTO rides (
        rider_id,
        driver_id,
        pickup_location,
        pickup_lat,
        pickup_lng,
        dropoff_location,
        dropoff_lat,
        dropoff_lng,
        scheduled_time,
        estimated_distance,
        estimated_duration,
        estimated_price,
        rider_notes,
        status
      ) VALUES (
        ${riderId},
        ${preferred_driver_id || null},
        ${pickup_location},
        ${pickup_lat},
        ${pickup_lng},
        ${dropoff_location},
        ${dropoff_lat},
        ${dropoff_lng},
        ${scheduled_time},
        ${estimated_distance || null},
        ${estimated_duration || null},
        ${estimated_price || null},
        ${rider_notes || null},
        'scheduled'
      )
      RETURNING *
    `;

    const ride = result[0];

    return NextResponse.json({
      success: true,
      ride: {
        id: ride.id,
        riderId: ride.rider_id,
        driverId: ride.driver_id,
        pickupLocation: ride.pickup_location,
        dropoffLocation: ride.dropoff_location,
        scheduledTime: ride.scheduled_time,
        estimatedPrice: ride.estimated_price,
        status: ride.status,
        createdAt: ride.created_at,
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Ride Schedule Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to schedule ride',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET - Retrieve scheduled rides
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'scheduled' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
    const userType = searchParams.get('user_type'); // 'rider' | 'driver'

    // Get user record
    const userResult = await sql`
      SELECT id, profile_type FROM users
      WHERE clerk_id = ${clerkId}
      LIMIT 1
    `;

    if (userResult.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userResult[0];
    const userId = user.id;

    let rides;

    if (userType === 'driver' || (!userType && (user.profile_type === 'driver' || user.profile_type === 'both'))) {
      // Get rides as driver
      if (status) {
        rides = await sql`
          SELECT * FROM rides
          WHERE driver_id = ${userId}
          AND status = ${status}
          ORDER BY scheduled_time ASC
        `;
      } else {
        rides = await sql`
          SELECT * FROM rides
          WHERE driver_id = ${userId}
          ORDER BY scheduled_time ASC
        `;
      }
    } else {
      // Get rides as rider
      if (status) {
        rides = await sql`
          SELECT * FROM rides
          WHERE rider_id = ${userId}
          AND status = ${status}
          ORDER BY scheduled_time ASC
        `;
      } else {
        rides = await sql`
          SELECT * FROM rides
          WHERE rider_id = ${userId}
          ORDER BY scheduled_time ASC
        `;
      }
    }

    // Format response
    const formattedRides = rides.map((ride: any) => ({
      id: ride.id,
      riderId: ride.rider_id,
      driverId: ride.driver_id,
      pickupLocation: ride.pickup_location,
      pickupLat: ride.pickup_lat,
      pickupLng: ride.pickup_lng,
      dropoffLocation: ride.dropoff_location,
      dropoffLat: ride.dropoff_lat,
      dropoffLng: ride.dropoff_lng,
      scheduledTime: ride.scheduled_time,
      estimatedDistance: ride.estimated_distance,
      estimatedDuration: ride.estimated_duration,
      estimatedPrice: ride.estimated_price,
      actualPrice: ride.actual_price,
      status: ride.status,
      riderNotes: ride.rider_notes,
      createdAt: ride.created_at,
      updatedAt: ride.updated_at,
    }));

    return NextResponse.json({
      rides: formattedRides,
      count: formattedRides.length,
    });

  } catch (error) {
    console.error('Ride Fetch Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rides' },
      { status: 500 }
    );
  }
}

// PATCH - Update ride status or details
export async function PATCH(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ride_id, status, driver_id, actual_price, driver_notes } = body;

    if (!ride_id) {
      return NextResponse.json(
        { error: 'ride_id is required' },
        { status: 400 }
      );
    }

    // Get user record
    const userResult = await sql`
      SELECT id, profile_type FROM users
      WHERE clerk_id = ${clerkId}
      LIMIT 1
    `;

    if (userResult.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userResult[0];
    const userId = user.id;

    // Get the ride to verify ownership
    const rideResult = await sql`
      SELECT * FROM rides WHERE id = ${ride_id} LIMIT 1
    `;

    if (rideResult.length === 0) {
      return NextResponse.json(
        { error: 'Ride not found' },
        { status: 404 }
      );
    }

    const ride = rideResult[0];

    // Verify user has permission to update this ride
    const isRider = ride.rider_id === userId;
    const isDriver = ride.driver_id === userId;

    if (!isRider && !isDriver) {
      return NextResponse.json(
        { error: 'Unauthorized to update this ride' },
        { status: 403 }
      );
    }

    // Build update query
    const updates: any = {};
    if (status) updates.status = status;
    if (driver_id && isRider) updates.driver_id = driver_id; // Only rider can assign driver
    if (actual_price && isDriver) updates.actual_price = actual_price; // Only driver can set actual price
    if (driver_notes && isDriver) updates.driver_notes = driver_notes; // Only driver can add notes

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Perform update
    const updatedRide = await sql`
      UPDATE rides
      SET
        status = COALESCE(${updates.status || null}, status),
        driver_id = COALESCE(${updates.driver_id || null}, driver_id),
        actual_price = COALESCE(${updates.actual_price || null}, actual_price),
        driver_notes = COALESCE(${updates.driver_notes || null}, driver_notes),
        updated_at = NOW()
      WHERE id = ${ride_id}
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      ride: updatedRide[0],
    });

  } catch (error) {
    console.error('Ride Update Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update ride',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE - Cancel a scheduled ride
export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rideId = searchParams.get('ride_id');

    if (!rideId) {
      return NextResponse.json(
        { error: 'ride_id parameter required' },
        { status: 400 }
      );
    }

    // Get user record
    const userResult = await sql`
      SELECT id FROM users
      WHERE clerk_id = ${clerkId}
      LIMIT 1
    `;

    if (userResult.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userId = userResult[0].id;

    // Verify the ride belongs to the user
    const rideResult = await sql`
      SELECT * FROM rides
      WHERE id = ${rideId}
      AND rider_id = ${userId}
      LIMIT 1
    `;

    if (rideResult.length === 0) {
      return NextResponse.json(
        { error: 'Ride not found or unauthorized' },
        { status: 404 }
      );
    }

    // Update ride status to cancelled instead of deleting
    await sql`
      UPDATE rides
      SET status = 'cancelled',
          updated_at = NOW()
      WHERE id = ${rideId}
    `;

    // Cascade: cancel calendar booking + linked post
    const { cancelRideBooking } = await import('@/lib/schedule/conflicts');
    cancelRideBooking(rideId).catch(() => {});
    const postRows = await sql`SELECT hmu_post_id FROM rides WHERE id = ${rideId} LIMIT 1`;
    const postId = (postRows[0] as Record<string, unknown>)?.hmu_post_id as string;
    if (postId) await sql`UPDATE hmu_posts SET status = 'cancelled' WHERE id = ${postId}`.catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Ride cancelled successfully',
    });

  } catch (error) {
    console.error('Ride Cancel Error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel ride' },
      { status: 500 }
    );
  }
}
