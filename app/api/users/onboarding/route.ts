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
import { getActiveOffer, enrollDriver, LAUNCH_OFFER_ENABLED } from '@/lib/db/enrollment-offers';
import { sendSms } from '@/lib/sms/textbee';
import { publishAdminEvent } from '@/lib/ably/server';
import { createCustomer, createConnectAccount } from '@/lib/stripe/client';
import { afterResponse } from '@/lib/runtime/after-response';

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
      phone,
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
      // Race fallback: onboarding finished before the Clerk webhook fired.
      // Pull attribution from Clerk unsafeMetadata so it matches the webhook path.
      let signupSource: 'hmu_chat' | 'direct' | 'homepage_lead' = 'direct';
      let referredByDriverId: string | null = null;
      try {
        const clerk = await clerkClient();
        const clerkUser = await clerk.users.getUser(clerkId);
        const meta = (clerkUser.unsafeMetadata || {}) as Record<string, unknown>;
        const srcRaw = (meta.signup_source as string) || 'direct';
        if (['hmu_chat', 'direct', 'homepage_lead'].includes(srcRaw)) {
          signupSource = srcRaw as typeof signupSource;
        }
        const refHandle = (meta.ref_handle as string) || null;
        if (refHandle) {
          const rows = await sql`SELECT user_id FROM driver_profiles WHERE handle = ${refHandle} LIMIT 1`;
          referredByDriverId = rows[0]?.user_id || null;
        }
      } catch (metaErr) {
        console.warn('[ONBOARDING] Could not read Clerk unsafeMetadata for attribution:', metaErr);
      }

      const newUser = await sql`
        INSERT INTO users (
          clerk_id,
          profile_type,
          account_status,
          tier,
          og_status,
          chill_score,
          signup_source,
          referred_by_driver_id
        ) VALUES (
          ${clerkId},
          ${profile_type},
          'pending_activation',
          'free',
          false,
          100,
          ${signupSource},
          ${referredByDriverId}
        )
        ON CONFLICT (clerk_id) DO NOTHING
        RETURNING id
      `;

      if (newUser.length > 0) {
        userId = newUser[0].id;

        // Mirror the webhook's Stripe provisioning for the race case where
        // onboarding beat the webhook. Deferred via afterResponse so slow
        // Stripe API calls don't block the success screen.
        afterResponse(async () => {
          try {
            const clerk = await clerkClient();
            const clerkUser = await clerk.users.getUser(clerkId);
            const email = clerkUser.emailAddresses[0]?.emailAddress || '';
            const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'User';
            await createCustomer({ clerkId, email, name });
            if (profile_type === 'driver' || profile_type === 'both') {
              await createConnectAccount({ clerkId, email });
            }
          } catch (stripeErr) {
            console.error('[ONBOARDING] Stripe provisioning failed (non-fatal):', stripeErr);
          }
        });
      } else {
        // Lost the race to the webhook — re-fetch the row it just created.
        const raced = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
        userId = (raced[0] as { id: string }).id;
      }
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

        // Save phone from Clerk auth (parallels the driver path below).
        if (phone) {
          await sql`UPDATE rider_profiles SET phone = ${phone} WHERE user_id = ${userId}`;
        }
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

        // Save phone from Clerk auth
        if (phone) {
          await sql`UPDATE driver_profiles SET phone = ${phone} WHERE user_id = ${userId}`;
        }

        // Auto-enroll in active launch offer (snapshot terms at signup)
        try {
          const activeOffer = LAUNCH_OFFER_ENABLED ? await getActiveOffer() : null;
          if (activeOffer) {
            const enrollment = await enrollDriver(userId, activeOffer);
            results.enrollment = {
              offerName: activeOffer.name,
              headline: activeOffer.headline,
              freeRides: enrollment.free_rides,
              freeEarningsCap: Number(enrollment.free_earnings_cap),
              freeDays: enrollment.free_days,
            };
          }
        } catch (enrollErr) {
          console.error('[ONBOARDING] Failed to enroll driver in offer:', enrollErr);
        }
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

    // Defer non-critical external API work until AFTER the response is sent.
    // Before: these two blocks added 1–3s of latency to the user-visible
    // response (and up to 3 minutes on cold starts), hiding the success screen
    // and confetti. Now they run via ctx.waitUntil() so the response returns
    // immediately and these side effects run in the background.
    afterResponse(async () => {
      // Sync profileType to Clerk publicMetadata so return logins can read it
      // without relying on URL params.
      try {
        const clerk = await clerkClient();
        await clerk.users.updateUserMetadata(clerkId, {
          publicMetadata: { profileType: profile_type },
        });
      } catch (clerkErr) {
        console.error('[ONBOARDING] Failed to sync profileType to Clerk:', clerkErr);
      }

      // Send welcome SMS with guide link.
      if (phone) {
        try {
          if (profile_type === 'driver') {
            await sendSms(
              phone,
              `${first_name || 'Hey'}, welcome to HMU ATL! We're Atlanta-based and built this for you. See how drivers get paid: atl.hmucashride.com/guide/driver`,
              { userId, eventType: 'welcome_driver' }
            );
          } else {
            await sendSms(
              phone,
              `${first_name || 'Hey'}, welcome to HMU ATL! We're Atlanta-based and value every rider's voice. See how booking works: atl.hmucashride.com/guide/rider`,
              { userId, eventType: 'welcome_rider' }
            );
          }
        } catch (smsErr) {
          console.error('[ONBOARDING] Welcome SMS failed:', smsErr);
        }
      }
    });

    publishAdminEvent('user_signup', { userId, profileType: profile_type, name: first_name }).catch(() => {});

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
