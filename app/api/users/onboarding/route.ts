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
import { renderTemplate } from '@/lib/sms/templates';
import { publishAdminEvent } from '@/lib/ably/server';
import { createCustomer, createConnectAccount } from '@/lib/stripe/client';
import { afterResponse } from '@/lib/runtime/after-response';
import { resolveMarketBySlug } from '@/lib/markets/resolver';
import { cookies } from 'next/headers';
import { ATTRIB_COOKIE, attachAttributionToUser } from '@/lib/attribution';

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
      ride_types,
      home_area_slug,
      // Driver-specific
      areas,
      area_slugs,
      services_entire_market,
      accepts_long_distance,
      pricing,
      schedule,
      advance_notice_hours,
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

    // Validate required fields. Express driver onboarding defers govt name
    // (first_name + last_name) to the post-onboarding "Pre-Ride To-Do",
    // so we accept a request when display_name (the handle) is present
    // even if first/last are blank. We still require *some* identifying
    // string so user records aren't created completely nameless.
    const hasName = !!(first_name && last_name);
    const hasDisplay = typeof display_name === 'string' && display_name.trim().length > 0;
    if (!profile_type || (!hasName && !hasDisplay)) {
      return NextResponse.json(
        { error: 'Missing required fields: profile_type and either display_name or first_name + last_name' },
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
      let verifiedPhone: string | null = null;
      let marketId: string | null = null;
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
        // Extract verified phone
        for (const p of clerkUser.phoneNumbers || []) {
          if (p.verification?.status === 'verified') { verifiedPhone = p.phoneNumber; break; }
        }
        // Market — set by sign-up page from the subdomain Host header.
        const marketSlug = (meta.market as string) || null;
        if (marketSlug) {
          const market = await resolveMarketBySlug(marketSlug);
          marketId = market?.market_id || null;
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
          phone,
          signup_source,
          referred_by_driver_id,
          market_id
        ) VALUES (
          ${clerkId},
          ${profile_type},
          'pending_activation',
          'free',
          false,
          100,
          ${verifiedPhone},
          ${signupSource},
          ${referredByDriverId},
          ${marketId}
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

    // Link first-touch UTM attribution (cookie set by middleware, populated by
    // AttributionTracker on landing) to this user. Idempotent — if a row was
    // already linked elsewhere (e.g. lazy attach in /driver/dashboard) the
    // WHERE user_id IS NULL clause makes this a no-op. Catch + swallow because
    // a missing cookie or DB blip should never block onboarding.
    try {
      const cookieStore = await cookies();
      const cookieId = cookieStore.get(ATTRIB_COOKIE)?.value;
      if (cookieId) {
        await attachAttributionToUser(cookieId, userId);
      }
    } catch (attribErr) {
      console.warn('[ONBOARDING] attribution attach failed (non-fatal):', attribErr);
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
        // ride_types: server-side trim — slugs only, max 24 entries to match
        // the admin endpoint cap. Anything else is silently dropped.
        const SLUG_RE = /^[a-z0-9_]{1,32}$/;
        const cleanedRideTypes = Array.isArray(ride_types)
          ? Array.from(new Set(
              ride_types
                .map((s: unknown) => typeof s === 'string' ? s.toLowerCase() : '')
                .filter((s: string) => s.length > 0 && SLUG_RE.test(s))
            )).slice(0, 24)
          : undefined;
        const cleanedHomeArea = typeof home_area_slug === 'string' && home_area_slug.trim().length > 0
          ? home_area_slug.trim()
          : null;

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
          ride_types: cleanedRideTypes,
          home_area_slug: cleanedHomeArea,
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
          area_slugs: Array.isArray(area_slugs) ? area_slugs : undefined,
          services_entire_market: typeof services_entire_market === 'boolean' ? services_entire_market : undefined,
          accepts_long_distance: typeof accepts_long_distance === 'boolean' ? accepts_long_distance : undefined,
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

        // advance_notice_hours is a top-level column (not in schedule JSONB)
        // and createDriverProfile doesn't take it; patch it here so express
        // onboarding's noticeRequired default lands in the right place.
        if (advance_notice_hours !== undefined && advance_notice_hours !== null) {
          await sql`UPDATE driver_profiles SET advance_notice_hours = ${Number(advance_notice_hours)} WHERE user_id = ${userId}`;
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

    // Clerk metadata sync MUST run before the response returns so the
    // client's next render (useUser, auth-callback, error boundary) sees
    // profileType immediately. Deferring this was causing signed-in users
    // to be wrongly routed to /onboarding whenever a page errored in the
    // race window between onboarding-success and Clerk session catch-up.
    // Twilio SMS below stays deferred — it has no user-visible dependency.
    try {
      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: { profileType: profile_type },
      });
    } catch (clerkErr) {
      // Log but don't block — the DB profile exists, so auth-callback's
      // onboarding-status check will still route correctly on return.
      console.error('[ONBOARDING] Failed to sync profileType to Clerk:', clerkErr);
    }

    afterResponse(async () => {
      // Send welcome SMS with guide link.
      if (phone) {
        try {
          // Greeting first name — both templates accept `firstName`, fall back
          // to "Hey" when the user hasn't supplied one (Clerk express signups).
          const firstName = first_name || 'Hey';
          if (profile_type === 'driver') {
            const welcomeFallback = `${firstName}, welcome to HMU ATL! We're Atlanta-based and built this for you. See how drivers get paid: atl.hmucashride.com/guide/driver`;
            const welcome = (await renderTemplate('welcome_driver', { firstName })) ?? welcomeFallback;
            await sendSms(phone, welcome, { userId, eventType: 'welcome_driver' });

            const safetyFallback = `Safety on HMU is non-negotiable. How we keep drivers safe (deposits, GPS, check-ins, women-rider matching): atl.hmucashride.com/safety/driver`;
            const safety = (await renderTemplate('safety_intro_driver', {})) ?? safetyFallback;
            await sendSms(phone, safety, { userId, eventType: 'safety_intro_driver' });
          } else {
            const welcomeFallback = `${firstName}, welcome to HMU ATL! We're Atlanta-based and value every rider's voice. See how booking works: atl.hmucashride.com/guide/rider`;
            const welcome = (await renderTemplate('welcome_rider', { firstName })) ?? welcomeFallback;
            await sendSms(phone, welcome, { userId, eventType: 'welcome_rider' });

            const safetyFallback = `Safety first. How we keep riders safe (women-driver filter, deposit refunds, GPS, mid-ride check-ins): atl.hmucashride.com/safety/rider`;
            const safety = (await renderTemplate('safety_intro_rider', {})) ?? safetyFallback;
            await sendSms(phone, safety, { userId, eventType: 'safety_intro_rider' });
          }
        } catch (smsErr) {
          console.error('[ONBOARDING] Welcome SMS failed:', smsErr);
        }
      }
    });

    // Express drivers defer first_name, so prefer display_name (the handle the
    // rider sees) and fall back to first_name only when display_name is blank.
    publishAdminEvent('user_signup', {
      userId,
      profileType: profile_type,
      name: (display_name && String(display_name).trim()) || first_name || null,
    }).catch(() => {});

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
