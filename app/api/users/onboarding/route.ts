// User Onboarding API
// Handles initial profile creation for riders and drivers after signup

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import {
  createRiderProfile,
  createDriverProfile,
  getRiderProfileByUserId,
  getDriverProfileByUserId
} from '@/lib/db/profiles';
import { sql } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const {
      profile_type, // 'rider' | 'driver' | 'both'
      first_name,
      last_name,
      display_name,
      gender,
      pronouns,
      lgbtq_friendly,
      video_url,
      thumbnail_url,
      // Rider-specific
      driver_gender_pref,
      require_lgbtq_friendly,
      min_driver_rating,
      require_verification,
      avoid_disputes,
      price_range,
      stripe_customer_id,
      // Driver-specific
      areas,
      pricing,
      schedule,
      vehicle_info,
      license_plate,
      plate_state,
      ad_photo_url,
      stripe_connect_id,
      // Driver rider-preference fields
      rider_gender_pref,
      require_og_status,
      min_rider_chill_score,
      avoid_riders_with_disputes,
    } = body;

    // Validate required fields
    if (!profile_type || !first_name || !last_name) {
      return NextResponse.json(
        { error: 'Missing required fields: profile_type, first_name, last_name' },
        { status: 400 }
      );
    }

    if (!['rider', 'driver', 'both'].includes(profile_type)) {
      return NextResponse.json(
        { error: 'Invalid profile_type. Must be "rider", "driver", or "both"' },
        { status: 400 }
      );
    }

    // Get or create user record
    let userResult = await sql`
      SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
    `;

    let userId: string;

    if (userResult.length === 0) {
      // Create new user record
      const newUser = await sql`
        INSERT INTO users (
          clerk_id,
          profile_type,
          account_status,
          tier,
          og_status,
          chill_score
        ) VALUES (
          ${clerkId},
          ${profile_type},
          'pending_activation',
          'free',
          false,
          0
        )
        RETURNING id
      `;
      userId = newUser[0].id;
    } else {
      userId = userResult[0].id;

      // Update profile type if changing
      await sql`
        UPDATE users
        SET profile_type = ${profile_type},
            updated_at = NOW()
        WHERE id = ${userId}
      `;
    }

    const results: any = {
      userId,
      profileType: profile_type,
      profiles: {}
    };

    // Create rider profile if needed
    if (profile_type === 'rider' || profile_type === 'both') {
      // Check if profile already exists
      const existingRider = await getRiderProfileByUserId(userId);

      if (!existingRider) {
        const riderProfile = await createRiderProfile({
          user_id: userId,
          first_name,
          last_name,
          display_name: display_name || `${first_name} ${last_name?.charAt(0) || ''}.`.trim(),
          gender,
          pronouns,
          lgbtq_friendly,
          video_url,
          thumbnail_url,
          driver_gender_pref,
          require_lgbtq_friendly,
          min_driver_rating,
          require_verification,
          avoid_disputes,
          price_range,
          stripe_customer_id,
        });
        results.profiles.rider = riderProfile;
      } else {
        results.profiles.rider = existingRider;
        results.message = 'Rider profile already exists';
      }
    }

    // Create driver profile if needed
    if (profile_type === 'driver' || profile_type === 'both') {
      // Check if profile already exists
      const existingDriver = await getDriverProfileByUserId(userId);

      if (!existingDriver) {
        const driverProfile = await createDriverProfile({
          user_id: userId,
          first_name,
          last_name,
          display_name: display_name || `${first_name} ${last_name?.charAt(0) || ''}.`.trim(),
          gender,
          pronouns,
          lgbtq_friendly,
          video_url,
          thumbnail_url,
          areas,
          pricing,
          schedule,
          vehicle_info: {
            ...(vehicle_info || {}),
            ...(license_plate ? { license_plate, plate_state: plate_state || 'GA' } : {}),
            ...(ad_photo_url ? { photo_url: ad_photo_url } : {}),
          },
          stripe_connect_id,
          min_rider_chill_score,
          require_og_status,
        });
        results.profiles.driver = driverProfile;
      } else {
        results.profiles.driver = existingDriver;
        results.message = results.message
          ? 'Both profiles already exist'
          : 'Driver profile already exists';
      }
    }

    // Activate account once profile is created
    // Video and payment are optional during onboarding — required before first ride
    await sql`
      UPDATE users
      SET account_status = 'active',
          updated_at = NOW()
      WHERE id = ${userId}
    `;
    results.accountStatus = 'active';

    // Sync profileType to Clerk publicMetadata so the onboarding page
    // can read it directly on return logins without relying on URL params.
    try {
      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: { profileType: profile_type },
      });
    } catch (clerkErr) {
      // Non-fatal — user can still use the app, just log it
      console.error('[ONBOARDING] Failed to sync profileType to Clerk:', clerkErr);
    }

    return NextResponse.json({
      success: true,
      ...results
    }, { status: 201 });

  } catch (error) {
    console.error('Onboarding API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create profile',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check onboarding status
export async function GET(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user record
    const userResult = await sql`
      SELECT id, profile_type, account_status FROM users
      WHERE clerk_id = ${clerkId}
      LIMIT 1
    `;

    if (userResult.length === 0) {
      return NextResponse.json({
        onboarded: false,
        needsOnboarding: true
      });
    }

    const user = userResult[0];
    const userId = user.id;

    // Check for existing profiles
    const riderProfile = await getRiderProfileByUserId(userId);
    const driverProfile = await getDriverProfileByUserId(userId);

    const hasRiderProfile = !!riderProfile;
    const hasDriverProfile = !!driverProfile;

    const needsRiderProfile = (user.profile_type === 'rider' || user.profile_type === 'both') && !hasRiderProfile;
    const needsDriverProfile = (user.profile_type === 'driver' || user.profile_type === 'both') && !hasDriverProfile;

    return NextResponse.json({
      onboarded: user.account_status === 'active',
      accountStatus: user.account_status,
      profileType: user.profile_type,
      hasRiderProfile,
      hasDriverProfile,
      needsRiderProfile,
      needsDriverProfile,
      needsOnboarding: needsRiderProfile || needsDriverProfile
    });

  } catch (error) {
    console.error('Onboarding Status Check Error:', error);
    return NextResponse.json(
      { error: 'Failed to check onboarding status' },
      { status: 500 }
    );
  }
}
