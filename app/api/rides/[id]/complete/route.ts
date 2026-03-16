// POST /api/rides/[id]/complete
// Driver completes ride and triggers payment

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { RideStateMachine } from '@/lib/rides/state-machine';
import { updateDriverStatus } from '@/lib/rides/matching';
import { calculateDistance } from '@/lib/geo/distance';
import { calculateFare } from '@/lib/payments/escrow';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: rideId } = await params;

    // 2. Get ride details with driver info
    const rideResult = await pool.query(
      `SELECT
         r.id,
         r.status,
         r.rider_id,
         r.driver_id,
         r.pickup_latitude,
         r.pickup_longitude,
         r.dropoff_latitude,
         r.dropoff_longitude,
         r.started_at,
         r.estimated_fare,
         r.estimated_distance,
         d.user_id as driver_user_id
       FROM rides r
       JOIN drivers d ON r.driver_id = d.id
       WHERE r.id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Ride not found' },
        { status: 404 }
      );
    }

    const ride = rideResult.rows[0];

    // 3. Validate user is the driver for this ride
    if (ride.driver_user_id !== user.id) {
      return NextResponse.json(
        { error: 'Only the assigned driver can complete this ride' },
        { status: 403 }
      );
    }

    // 4. Validate ride status
    if (ride.status !== 'in_progress') {
      return NextResponse.json(
        { error: `Cannot complete ride in ${ride.status} status` },
        { status: 400 }
      );
    }

    // 5. Calculate actual distance and duration
    const actualDistance = calculateDistance(
      { latitude: ride.pickup_latitude, longitude: ride.pickup_longitude },
      { latitude: ride.dropoff_latitude, longitude: ride.dropoff_longitude }
    );

    const startedAt = new Date(ride.started_at);
    const completedAt = new Date();
    const actualDuration = Math.ceil(
      (completedAt.getTime() - startedAt.getTime()) / (1000 * 60)
    );

    // 6. Calculate final fare based on actual trip data
    const fareBreakdown = calculateFare({
      distanceMiles: actualDistance,
      estimatedMinutes: actualDuration,
    });

    // 7. Update ride to completed
    await pool.query(
      `UPDATE rides
       SET
         status = 'completed',
         completed_at = NOW(),
         actual_distance = $1,
         actual_duration = $2,
         final_fare = $3,
         updated_at = NOW()
       WHERE id = $4`,
      [actualDistance, actualDuration, fareBreakdown.total, rideId]
    );

    // 8. Update driver status to available
    await updateDriverStatus(ride.driver_id, 'available');

    // 9. Log status change
    await pool.query(
      `INSERT INTO ride_status_log (ride_id, status, changed_by_user_id, notes)
       VALUES ($1, 'completed', $2, 'Ride completed successfully')`,
      [rideId, user.id]
    );

    console.log(`[RIDES] Ride ${rideId} completed by driver ${ride.driver_id}`);

    // 10. Return completion details
    return NextResponse.json({
      success: true,
      ride: {
        id: rideId,
        status: 'completed',
        completedAt,
        actualDistance,
        actualDuration,
        fare: {
          estimated: ride.estimated_fare,
          actual: fareBreakdown.total,
          breakdown: {
            baseFare: fareBreakdown.baseFare,
            distanceFee: fareBreakdown.distanceFee,
            timeFee: fareBreakdown.timeFee,
          },
        },
      },
    });
  } catch (error) {
    console.error('[RIDES] Complete error:', error);

    return NextResponse.json(
      { error: 'Failed to complete ride' },
      { status: 500 }
    );
  }
}
