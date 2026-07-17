// GET /api/admin/users/[id] — Full user profile for admin view
// PATCH /api/admin/users/[id] — Update user (status, tier, og_status, chill_score)
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { clerkClient } from '@clerk/nextjs/server';
import { resolveActionItem } from '@/lib/admin/action-items';
import { normalizeHandle, isHandleTaken, HANDLE_ERROR } from '@/lib/profile/handle';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;

  try {
  const [userRows, rideRows, ratingRows, disputeRows, activityRows, paymentRows, totalsRows] = await Promise.all([
    sql`
      SELECT
        u.id, u.clerk_id, u.profile_type, u.account_status, u.tier,
        u.phone as user_phone, u.deleted_at,
        u.og_status, u.chill_score, u.is_admin, COALESCE(u.completed_rides, 0) as completed_rides,
        (SELECT COUNT(*) FROM disputes WHERE filed_by = u.id) as dispute_count,
        u.created_at, u.updated_at,
        u.signup_source, u.referred_by_driver_id,
        u.last_sign_in_at, u.sign_in_count, u.first_return_at,
        u.market_id,
        m.name as market_name, m.slug as market_slug,
        dp.first_name as driver_first, dp.last_name as driver_last,
        dp.display_name as driver_display, dp.handle, dp.stripe_account_id,
        dp.stripe_onboarding_complete,
        dp.video_url, dp.thumbnail_url as driver_thumbnail, dp.areas as driver_areas, dp.vehicle_info, dp.phone as driver_phone,
        dp.profile_visible,
        dp.area_slugs, dp.services_entire_market,
        rp.first_name as rider_first, rp.last_name as rider_last,
        rp.display_name as rider_display, rp.stripe_customer_id, rp.phone as rider_phone,
        rp.avatar_url as rider_avatar, rp.thumbnail_url as rider_thumbnail,
        -- Referring driver name
        ref_dp.display_name as ref_driver_name, ref_dp.handle as ref_driver_handle
      FROM users u
      LEFT JOIN markets m ON m.id = u.market_id
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      LEFT JOIN driver_profiles ref_dp ON ref_dp.user_id = u.referred_by_driver_id
      WHERE u.id = ${id}
      LIMIT 1
    `,
    sql`
      SELECT id, status, COALESCE(final_agreed_price, amount) as amount,
        COALESCE(platform_fee_amount, 0) as platform_fee,
        COALESCE(driver_payout_amount, 0) as driver_payout,
        created_at, driver_id, rider_id, pickup, dropoff
      FROM rides
      WHERE driver_id = ${id} OR rider_id = ${id}
      ORDER BY created_at DESC
      LIMIT 20
    `,
    sql`
      SELECT r.rating_type, r.created_at, r.ride_id,
        CASE WHEN r.rater_id = ${id} THEN 'given' ELSE 'received' END as direction,
        CASE WHEN r.rater_id = ${id} THEN r.rated_id ELSE r.rater_id END as other_user_id
      FROM ratings r
      WHERE r.rater_id = ${id} OR r.rated_id = ${id}
      ORDER BY r.created_at DESC
      LIMIT 30
    `,
    sql`
      SELECT id, ride_id, status, reason, created_at
      FROM disputes
      WHERE filed_by = ${id}
         OR ride_id IN (SELECT id FROM rides WHERE driver_id = ${id} OR rider_id = ${id})
      ORDER BY created_at DESC
      LIMIT 10
    `,
    sql`
      SELECT event_name, properties, created_at
      FROM user_activity
      WHERE user_id = ${id}
      ORDER BY created_at DESC
      LIMIT 30
    `,
    // Saved cards for riders (default first). Empty = no payment method.
    sql`
      SELECT brand, last4, exp_month, exp_year, is_default
      FROM rider_payment_methods
      WHERE rider_id = ${id}
      ORDER BY is_default DESC, created_at DESC
    `,
    // Lifetime totals — completed rides only.
    // spent: rider paid (actual price). earned: driver net payout.
    sql`
      SELECT
        COALESCE(SUM(CASE WHEN rider_id = ${id} THEN COALESCE(final_agreed_price, amount) END), 0) as lifetime_spend,
        COALESCE(SUM(CASE WHEN driver_id = ${id} THEN COALESCE(driver_payout_amount, 0) END), 0) as lifetime_earned,
        COUNT(*) FILTER (WHERE rider_id = ${id}) as rider_completed_count,
        COUNT(*) FILTER (WHERE driver_id = ${id}) as driver_completed_count
      FROM rides
      WHERE status = 'completed'
        AND (rider_id = ${id} OR driver_id = ${id})
    `,
  ]);

  if (!userRows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const u = userRows[0];

  // Correlate old <-> new accounts: other users sharing this phone number.
  // Account deletion is a soft-delete + fresh re-signup, so a returning person
  // has multiple rows with the same phone. This is the ONLY link between them
  // (deliberately no user-facing cross-pollination). NULL phone matches nothing.
  const corrPhone = (u.user_phone || u.driver_phone || u.rider_phone) as string | null;
  const relatedRows = corrPhone
    ? await sql`
        SELECT u2.id, u2.profile_type, u2.account_status, u2.created_at, u2.deleted_at,
               COALESCE(dp2.display_name, dp2.first_name, rp2.display_name, rp2.first_name, rp2.handle) AS name
        FROM users u2
        LEFT JOIN driver_profiles dp2 ON dp2.user_id = u2.id
        LEFT JOIN rider_profiles  rp2 ON rp2.user_id = u2.id
        WHERE u2.id <> ${id}
          AND u2.phone = ${corrPhone}
        ORDER BY u2.created_at DESC
        LIMIT 25
      `
    : [];

  const isDriver = u.profile_type === 'driver' || u.profile_type === 'both';
  const isRider = u.profile_type === 'rider' || u.profile_type === 'both';
  const defaultPm = (paymentRows[0] as Record<string, unknown> | undefined) ?? null;
  const driverPaymentReady = isDriver && Boolean(u.stripe_onboarding_complete);
  const riderPaymentReady = isRider && paymentRows.length > 0;
  const paymentReady = driverPaymentReady || riderPaymentReady;
  const totals = (totalsRows[0] as Record<string, unknown>) ?? {};

  return NextResponse.json({
    user: {
      id: u.id,
      clerkId: u.clerk_id,
      profileType: u.profile_type,
      accountStatus: u.account_status,
      tier: u.tier,
      ogStatus: u.og_status,
      isAdmin: u.is_admin ?? false,
      chillScore: Number(u.chill_score ?? 0),
      completedRides: Number(u.completed_rides ?? 0),
      disputeCount: Number(u.dispute_count ?? 0),
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      displayName: u.driver_display || u.driver_first
        ? `${u.driver_display || u.driver_first || ''} ${u.driver_last || ''}`.trim()
        : u.rider_display || u.rider_first
          ? `${u.rider_display || u.rider_first || ''} ${u.rider_last || ''}`.trim()
          : 'No name',
      handle: u.handle,
      stripeConnectId: u.stripe_account_id,
      stripeCustomerId: u.stripe_customer_id,
      videoUrl: u.video_url,
      driverAreas: u.driver_areas,
      vehicleInfo: u.vehicle_info,
      profileVisible: u.profile_visible ?? null,
      phone: u.driver_phone || u.rider_phone,
      avatarUrl: u.rider_avatar || u.driver_thumbnail || u.video_url,
      signupSource: u.signup_source,
      referredByDriverId: u.referred_by_driver_id,
      refDriverName: u.ref_driver_name,
      refDriverHandle: u.ref_driver_handle,
      lastSignInAt: u.last_sign_in_at,
      signInCount: Number(u.sign_in_count ?? 0),
      firstReturnAt: u.first_return_at,
      marketId: u.market_id ?? null,
      marketName: u.market_name ?? null,
      marketSlug: u.market_slug ?? null,
      areaSlugs: (u.area_slugs as string[]) ?? [],
      servicesEntireMarket: Boolean(u.services_entire_market),
      paymentReady,
      stripeOnboardingComplete: Boolean(u.stripe_onboarding_complete),
      paymentMethodCount: paymentRows.length,
      paymentBrand: defaultPm ? (defaultPm.brand as string | null) : null,
      paymentLast4: defaultPm ? (defaultPm.last4 as string | null) : null,
      paymentExpMonth: defaultPm ? (defaultPm.exp_month as number | null) : null,
      paymentExpYear: defaultPm ? (defaultPm.exp_year as number | null) : null,
      lifetimeSpend: Number(totals.lifetime_spend ?? 0),
      lifetimeEarned: Number(totals.lifetime_earned ?? 0),
      deletedAt: u.deleted_at ?? null,
    },
    // Old <-> new account correlation (same phone). Empty for most users.
    relatedAccounts: relatedRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: (r.name as string) || 'No name',
      profileType: r.profile_type,
      accountStatus: r.account_status,
      createdAt: r.created_at,
      deletedAt: r.deleted_at ?? null,
    })),
    activity: activityRows.map((a: Record<string, unknown>) => ({
      event: a.event_name,
      properties: a.properties,
      createdAt: a.created_at,
    })),
    rides: rideRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      status: r.status,
      price: Number(r.amount ?? 0),
      platformFee: Number(r.platform_fee ?? 0),
      driverPayout: Number(r.driver_payout ?? 0),
      driverId: r.driver_id,
      riderId: r.rider_id,
      pickup: r.pickup,
      dropoff: r.dropoff,
      createdAt: r.created_at,
    })),
    ratings: ratingRows.map((r: Record<string, unknown>) => ({
      type: r.rating_type,
      direction: r.direction,
      otherUserId: r.other_user_id,
      rideId: r.ride_id,
      createdAt: r.created_at,
    })),
    disputes: disputeRows.map((d: Record<string, unknown>) => ({
      id: d.id,
      rideId: d.ride_id,
      status: d.status,
      reason: d.reason,
      createdAt: d.created_at,
    })),
  });
  } catch (err) {
    console.error('[admin/users/[id]] GET error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json();
  const {
    accountStatus, tier, ogStatus, chillScore, profileVisible, adminNotes,
    // Public @handle (driver or rider)
    handle,
    // Market assignment
    marketId,
    // Driver area assignment
    areaSlugs, servicesEntireMarket,
    // Driver Lab fields — only applied when present
    displayName, thumbnailUrl, videoUrl, vehicleInfo, minimumFare,
    currentLat, currentLng,
  } = body;

  // Use COALESCE to only update provided fields
  const rows = await sql`
    UPDATE users SET
      account_status = COALESCE(${accountStatus ?? null}, account_status),
      tier           = COALESCE(${tier ?? null}, tier),
      og_status      = COALESCE(${ogStatus ?? null}, og_status),
      chill_score    = COALESCE(${chillScore ?? null}, chill_score),
      market_id      = CASE WHEN ${marketId !== undefined}::boolean
                         THEN ${marketId ?? null}::uuid
                         ELSE market_id END,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, clerk_id, account_status, tier, og_status, chill_score
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Public @handle change — globally unique across BOTH driver + rider handles
  // (they share one /d/{handle} + @handle namespace). Updates whichever profile
  // this user has.
  if (typeof handle === 'string' && handle.trim()) {
    const normalized = normalizeHandle(handle);
    if (!normalized) {
      return NextResponse.json({ error: HANDLE_ERROR }, { status: 400 });
    }
    if (await isHandleTaken(normalized, id)) {
      return NextResponse.json({ error: `Handle "${normalized}" is already taken` }, { status: 409 });
    }
    const ptRows = await sql`SELECT profile_type FROM users WHERE id = ${id} LIMIT 1`;
    const pt = (ptRows[0] as { profile_type?: string } | undefined)?.profile_type;
    if (pt === 'driver') {
      await sql`UPDATE driver_profiles SET handle = ${normalized} WHERE user_id = ${id}`;
    } else {
      await sql`UPDATE rider_profiles SET handle = ${normalized} WHERE user_id = ${id}`;
    }
  }

  // Driver profile fields — build a single UPDATE only when something changed.
  const hasDriverProfileChanges =
    profileVisible !== undefined ||
    displayName !== undefined ||
    thumbnailUrl !== undefined ||
    videoUrl !== undefined ||
    vehicleInfo !== undefined ||
    minimumFare !== undefined ||
    areaSlugs !== undefined ||
    servicesEntireMarket !== undefined ||
    (currentLat !== undefined && currentLng !== undefined);

  if (hasDriverProfileChanges) {
    // Only merge vehicle_info / pricing when those specific fields are in the payload.
    // Always fetching + writing them back would wipe data when the admin only
    // touches an unrelated field (e.g. thumbnailUrl).
    const needsVehicleOrPricing = vehicleInfo !== undefined || minimumFare !== undefined;
    let mergedVehicle: Record<string, unknown> | null = null;
    let mergedPricing: Record<string, unknown> | null = null;

    if (needsVehicleOrPricing) {
      const dpRows = await sql`
        SELECT vehicle_info, pricing FROM driver_profiles WHERE user_id = ${id} LIMIT 1
      `;
      const dp = (dpRows[0] as Record<string, unknown> | undefined) ?? {};
      const existingVehicle = (dp.vehicle_info as Record<string, unknown>) ?? {};
      const existingPricing = (dp.pricing as Record<string, unknown>) ?? {};
      mergedVehicle = vehicleInfo ? { ...existingVehicle, ...vehicleInfo } : existingVehicle;
      mergedPricing = minimumFare !== undefined ? { ...existingPricing, minimum: minimumFare } : existingPricing;
    }

    // Use a boolean param for the location_updated_at CASE so Postgres can
    // always infer the parameter type (null has no type and causes a 500).
    const setLocationNow = currentLat !== undefined && currentLat !== null;

    const setAreas = Array.isArray(areaSlugs);
    await sql`
      UPDATE driver_profiles SET
        profile_visible         = COALESCE(${profileVisible ?? null}, profile_visible),
        display_name            = COALESCE(${displayName ?? null}, display_name),
        thumbnail_url           = COALESCE(${thumbnailUrl ?? null}, thumbnail_url),
        video_url               = COALESCE(${videoUrl ?? null}, video_url),
        vehicle_info            = CASE WHEN ${needsVehicleOrPricing}::boolean
                                    THEN ${JSON.stringify(mergedVehicle ?? {})}::jsonb
                                    ELSE vehicle_info END,
        pricing                 = CASE WHEN ${needsVehicleOrPricing}::boolean
                                    THEN ${JSON.stringify(mergedPricing ?? {})}::jsonb
                                    ELSE pricing END,
        area_slugs              = CASE WHEN ${setAreas}::boolean
                                    THEN ${areaSlugs ?? []}
                                    ELSE area_slugs END,
        services_entire_market  = CASE WHEN ${servicesEntireMarket !== undefined}::boolean
                                    THEN ${servicesEntireMarket ?? false}::boolean
                                    ELSE services_entire_market END,
        current_lat             = COALESCE(${currentLat ?? null}, current_lat),
        current_lng             = COALESCE(${currentLng ?? null}, current_lng),
        location_updated_at     = CASE WHEN ${setLocationNow}::boolean
                                    THEN NOW() ELSE location_updated_at END,
        updated_at = NOW()
      WHERE user_id = ${id}
    `;
  }

  const user = rows[0];
  try {
    const clerk = await clerkClient();
    const metadata: Record<string, unknown> = {};
    if (accountStatus) metadata.accountStatus = accountStatus;
    if (tier) metadata.tier = tier;
    if (ogStatus !== undefined) metadata.ogStatus = ogStatus;
    await clerk.users.updateUserMetadata(user.clerk_id as string, {
      publicMetadata: metadata,
    });
  } catch {
    // Non-critical
  }

  await logAdminAction(admin.id, 'update_user', 'user', id, {
    changes: body,
    adminNotes,
  });

  // Resolve action item when admin takes action on a user
  await resolveActionItem('users', id);

  return NextResponse.json({ success: true, user: rows[0] });
}
