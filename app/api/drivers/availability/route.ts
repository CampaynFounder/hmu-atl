// Driver Availability API
// Manage driver schedules and availability

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getDriverProfileByUserId,
  updateDriverAvailability,
} from '@/lib/db/profiles';
import { sql } from '@/lib/db/client';

// GET driver availability/schedule
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID from clerk_id
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

    // Verify user is a driver
    if (user.profile_type !== 'driver' && user.profile_type !== 'both') {
      return NextResponse.json(
        { error: 'User is not a driver' },
        { status: 403 }
      );
    }

    const userId = user.id;

    // Get driver profile with schedule
    const driverProfile = await getDriverProfileByUserId(userId);

    if (!driverProfile) {
      return NextResponse.json(
        { error: 'Driver profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      schedule: driverProfile.schedule || {},
      areas: driverProfile.areas || [],
    });

  } catch (error) {
    console.error('Availability GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch availability' },
      { status: 500 }
    );
  }
}

// UPDATE driver availability/schedule
export async function PATCH(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { schedule, areas } = body;

    // Validate schedule format
    if (schedule && typeof schedule !== 'object') {
      return NextResponse.json(
        { error: 'Schedule must be an object' },
        { status: 400 }
      );
    }

    // Validate areas format
    if (areas && !Array.isArray(areas)) {
      return NextResponse.json(
        { error: 'Areas must be an array' },
        { status: 400 }
      );
    }

    // Get user ID from clerk_id
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

    // Verify user is a driver
    if (user.profile_type !== 'driver' && user.profile_type !== 'both') {
      return NextResponse.json(
        { error: 'User is not a driver' },
        { status: 403 }
      );
    }

    const userId = user.id;

    // Update driver availability
    const updatedProfile = await updateDriverAvailability(userId, schedule);

    // If areas are also being updated, update them separately
    if (areas) {
      await sql`
        UPDATE driver_profiles
        SET areas = ${JSON.stringify(areas)},
            updated_at = NOW()
        WHERE user_id = ${userId}
      `;
    }

    return NextResponse.json({
      success: true,
      schedule: updatedProfile.schedule,
      areas: areas || updatedProfile.areas,
    });

  } catch (error) {
    console.error('Availability UPDATE Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update availability',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST endpoint to set driver as currently available/unavailable
export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { available } = body;

    if (typeof available !== 'boolean') {
      return NextResponse.json(
        { error: 'available must be a boolean' },
        { status: 400 }
      );
    }

    // Get user ID from clerk_id
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

    // Verify user is a driver
    if (user.profile_type !== 'driver' && user.profile_type !== 'both') {
      return NextResponse.json(
        { error: 'User is not a driver' },
        { status: 403 }
      );
    }

    const userId = user.id;

    // Update driver's current availability status
    await sql`
      UPDATE driver_profiles
      SET available_now = ${available},
          last_seen = NOW(),
          updated_at = NOW()
      WHERE user_id = ${userId}
    `;

    return NextResponse.json({
      success: true,
      available,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Availability POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to update availability status' },
      { status: 500 }
    );
  }
}
