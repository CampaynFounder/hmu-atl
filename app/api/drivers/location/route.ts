// POST /api/drivers/location
// Update driver's current location (real-time tracking)

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { isValidCoordinates } from '@/lib/geo/distance';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Request validation schema
const UpdateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(), // Direction in degrees
  speed: z.number().min(0).max(200).optional(), // Speed in mph
});

export async function POST(req: NextRequest) {
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
        { error: 'Only drivers can update location' },
        { status: 403 }
      );
    }

    // 3. Parse and validate request
    const body = await req.json();
    const validated = UpdateLocationSchema.parse(body);

    const coordinates = {
      latitude: validated.latitude,
      longitude: validated.longitude,
    };

    // 4. Validate coordinates
    if (!isValidCoordinates(coordinates)) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // 5. Get driver record
    const driverResult = await pool.query(
      'SELECT id FROM drivers WHERE user_id = $1',
      [user.id]
    );

    if (driverResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Driver profile not found' },
        { status: 404 }
      );
    }

    const driverId = driverResult.rows[0].id;

    // 6. Update driver location
    await pool.query(
      `UPDATE drivers
       SET
         current_latitude = $1,
         current_longitude = $2,
         last_location_update = NOW(),
         updated_at = NOW()
       WHERE id = $3`,
      [validated.latitude, validated.longitude, driverId]
    );

    // 7. Log location update (for debugging/analytics)
    console.log(
      `[LOCATION] Driver ${driverId} location updated: ${validated.latitude}, ${validated.longitude}`
    );

    return NextResponse.json({
      success: true,
      location: {
        latitude: validated.latitude,
        longitude: validated.longitude,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[LOCATION] Update error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid location data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update location' },
      { status: 500 }
    );
  }
}
