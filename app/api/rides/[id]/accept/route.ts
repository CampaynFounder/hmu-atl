// POST /api/rides/[id]/accept
// Driver accepts a ride request

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { RideStateMachine } from '@/lib/rides/state-machine';
import { canDriverAcceptRide, updateDriverStatus } from '@/lib/rides/matching';

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

    // 2. Validate user is a driver
    if (!user.profile_type || !['driver', 'both'].includes(user.profile_type)) {
      return NextResponse.json(
        { error: 'Only drivers can accept rides' },
        { status: 403 }
      );
    }

    // 3. Check account status
    if (user.account_status !== 'active') {
      return NextResponse.json(
        { error: 'Account must be active to accept rides' },
        { status: 403 }
      );
    }

    const { id: rideId } = await params;

    // 4. Get driver record
    const driverResult = await pool.query(
      'SELECT id, status FROM drivers WHERE user_id = $1',
      [user.id]
    );

    if (driverResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Driver profile not found' },
        { status: 404 }
      );
    }

    const driver = driverResult.rows[0];

    // 5. Check if driver can accept rides
    if (!(await canDriverAcceptRide(driver.id))) {
      return NextResponse.json(
        { error: 'Driver must be available to accept rides' },
        { status: 400 }
      );
    }

    // 6. Get ride details
    const rideResult = await pool.query(
      `SELECT id, status, driver_id, rider_id
       FROM rides
       WHERE id = $1`,
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Ride not found' },
        { status: 404 }
      );
    }

    const ride = rideResult.rows[0];

    // 7. Validate ride can be accepted
    if (ride.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot accept ride in ${ride.status} status` },
        { status: 400 }
      );
    }

    if (ride.driver_id) {
      return NextResponse.json(
        { error: 'Ride already accepted by another driver' },
        { status: 409 }
      );
    }

    // 8. Atomic update: accept ride only if still pending
    const updateResult = await pool.query(
      `UPDATE rides
       SET
         driver_id = $1,
         status = 'matched',
         accepted_at = NOW(),
         updated_at = NOW()
       WHERE id = $2 AND status = 'pending' AND driver_id IS NULL
       RETURNING id, status, rider_id`,
      [driver.id, rideId]
    );

    if (updateResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Ride was already accepted by another driver' },
        { status: 409 }
      );
    }

    // 9. Update driver status
    await updateDriverStatus(driver.id, 'en_route');

    // 10. Log status change
    await pool.query(
      `INSERT INTO ride_status_log (ride_id, status, changed_by_user_id, notes)
       VALUES ($1, 'matched', $2, 'Driver accepted ride')`,
      [rideId, user.id]
    );

    console.log(`[RIDES] Driver ${driver.id} accepted ride ${rideId}`);

    // 11. Return success
    return NextResponse.json({
      success: true,
      ride: {
        id: rideId,
        status: 'matched',
        riderId: ride.rider_id,
      },
    });
  } catch (error) {
    console.error('[RIDES] Accept error:', error);

    return NextResponse.json(
      { error: 'Failed to accept ride' },
      { status: 500 }
    );
  }
}
