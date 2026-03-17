// User Profile API
// Get and update rider/driver profiles

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getRiderProfileByUserId,
  getDriverProfileByUserId,
  updateRiderProfile,
  updateDriverProfile,
} from '@/lib/db/profiles';
import { sql } from '@/lib/db/client';

// GET user profile(s)
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user record
    const userResult = await sql`
      SELECT id, profile_type, account_status, tier, og_status, chill_score
      FROM users
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

    // Get profiles based on profile_type
    const response: any = {
      user: {
        id: userId,
        profileType: user.profile_type,
        accountStatus: user.account_status,
        tier: user.tier,
        ogStatus: user.og_status,
        chillScore: user.chill_score,
      },
      profiles: {},
    };

    if (user.profile_type === 'rider' || user.profile_type === 'both') {
      const riderProfile = await getRiderProfileByUserId(userId);
      if (riderProfile) {
        response.profiles.rider = riderProfile;
      }
    }

    if (user.profile_type === 'driver' || user.profile_type === 'both') {
      const driverProfile = await getDriverProfileByUserId(userId);
      if (driverProfile) {
        response.profiles.driver = driverProfile;
      }
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Profile GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

// UPDATE user profile
export async function PATCH(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { profile_type, ...updates } = body;

    // Validate profile_type
    if (profile_type && !['rider', 'driver'].includes(profile_type)) {
      return NextResponse.json(
        { error: 'Invalid profile_type. Must be "rider" or "driver"' },
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

    // Determine which profile to update
    const targetProfileType = profile_type || user.profile_type;

    let updatedProfile;

    if (targetProfileType === 'rider' || (targetProfileType === 'both' && !profile_type)) {
      // Update rider profile
      updatedProfile = await updateRiderProfile(userId, updates);
    } else if (targetProfileType === 'driver') {
      // Update driver profile
      updatedProfile = await updateDriverProfile(userId, updates);
    } else {
      return NextResponse.json(
        { error: 'Profile type mismatch or invalid' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      profileType: targetProfileType,
    });

  } catch (error) {
    console.error('Profile UPDATE Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update profile',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
