// GET /api/rides/[id]
// Get ride status and details

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { RideStateMachine } from '@/lib/rides/state-machine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
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

    // 2. Get ride details with driver and rider info
    const rideResult = await pool.query(
      `SELECT
         r.id,
         r.status,
         r.pickup_latitude,
         r.pickup_longitude,
         r.pickup_address,
         r.dropoff_latitude,
         r.dropoff_longitude,
         r.dropoff_address,
         r.vehicle_type,
         r.passenger_count,
         r.estimated_distance,
         r.estimated_duration,
         r.estimated_fare,
         r.actual_distance,
         r.actual_duration,
         r.final_fare,
         r.created_at,
         r.accepted_at,
         r.started_at,
         r.completed_at,
         r.notes,
         -- Rider info
         ru.id as rider_user_id,
         ru.clerk_id as rider_clerk_id,
         -- Driver info (if assigned)
         d.id as driver_id,
         du.id as driver_user_id,
         du.clerk_id as driver_clerk_id,
         d.current_latitude as driver_latitude,
         d.current_longitude as driver_longitude,
         d.vehicle_type as driver_vehicle_type,
         d.vehicle_make,
         d.vehicle_model,
         d.vehicle_color,
         d.license_plate
       FROM rides r
       JOIN users ru ON r.rider_id = ru.id
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users du ON d.user_id = du.id
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

    // 3. Validate user has access to this ride (rider or driver)
    const isRider = ride.rider_user_id === user.id;
    const isDriver = ride.driver_user_id === user.id;

    if (!isRider && !isDriver) {
      return NextResponse.json(
        { error: 'Unauthorized to view this ride' },
        { status: 403 }
      );
    }

    // 4. Build response with appropriate data based on user role
    const response: any = {
      id: ride.id,
      status: ride.status,
      statusMessage: RideStateMachine.getStatusMessage(ride.status),
      pickup: {
        latitude: ride.pickup_latitude,
        longitude: ride.pickup_longitude,
        address: ride.pickup_address,
      },
      dropoff: {
        latitude: ride.dropoff_latitude,
        longitude: ride.dropoff_longitude,
        address: ride.dropoff_address,
      },
      vehicleType: ride.vehicle_type,
      passengerCount: ride.passenger_count,
      estimatedDistance: ride.estimated_distance,
      estimatedDuration: ride.estimated_duration,
      estimatedFare: ride.estimated_fare,
      actualDistance: ride.actual_distance,
      actualDuration: ride.actual_duration,
      finalFare: ride.final_fare,
      createdAt: ride.created_at,
      acceptedAt: ride.accepted_at,
      startedAt: ride.started_at,
      completedAt: ride.completed_at,
      notes: ride.notes,
    };

    // Include driver info if ride is matched
    if (ride.driver_id) {
      response.driver = {
        vehicleType: ride.driver_vehicle_type,
        vehicleMake: ride.vehicle_make,
        vehicleModel: ride.vehicle_model,
        vehicleColor: ride.vehicle_color,
        licensePlate: ride.license_plate,
      };

      // Include real-time location if driver is en route or on trip
      if (RideStateMachine.isActive(ride.status)) {
        response.driver.currentLocation = {
          latitude: ride.driver_latitude,
          longitude: ride.driver_longitude,
        };
      }
    }

    return NextResponse.json({
      success: true,
      ride: response,
    });
  } catch (error) {
    console.error('[RIDES] Get ride error:', error);

    return NextResponse.json(
      { error: 'Failed to get ride details' },
      { status: 500 }
    );
  }
}
