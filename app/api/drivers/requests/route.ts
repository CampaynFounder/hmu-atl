import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id, market_id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const driverUserId = (userRows[0] as { id: string; market_id: string | null }).id;
  const driverMarketId = (userRows[0] as { id: string; market_id: string | null }).market_id;

  // Driver routing preferences
  const prefRows = await sql`
    SELECT accepts_cash, cash_only, area_slugs, services_entire_market, accepts_long_distance
    FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
  `;
  const driverPrefs = (prefRows[0] || {}) as {
    accepts_cash: boolean;
    cash_only: boolean;
    area_slugs: string[] | null;
    services_entire_market: boolean;
    accepts_long_distance: boolean;
  };
  const driverAreaSlugs = Array.isArray(driverPrefs.area_slugs) ? driverPrefs.area_slugs : [];

  // Feed query:
  //   - same market only
  //   - direct bookings ALWAYS reach their target driver (area filters don't apply)
  //   - broadcast rider_requests gated by area match:
  //       * services_entire_market  → any pickup area in this market
  //       * else pickup_area_slug ∈ driver.area_slugs
  //         AND (dropoff_in_market AND dropoff_area_slug ∈ driver.area_slugs
  //              OR accepts_long_distance)
  //       * posts with no parsed pickup_area_slug fall back to visible if
  //         driver services the entire market (conservative default)
  //   - exclude posts this driver has already passed
  // We show declined_awaiting_rider posts as LOCKED previews alongside active
  // rider_requests — same market + area gate, except the driver who passed
  // (`last_declined_by`) is filtered out. Locked cards become interactive
  // the moment the rider taps Broadcast (status flips to active → Ably
  // push → feed refetch).
  const rows = await sql`
    SELECT
      p.id,
      p.post_type,
      p.status,
      p.price,
      p.time_window,
      p.booking_expires_at,
      p.expires_at,
      p.created_at,
      p.pickup_area_slug,
      p.dropoff_area_slug,
      p.dropoff_in_market,
      COALESCE(rp.handle, rp.display_name, 'Rider') AS rider_name,
      rp.handle AS rider_handle,
      rp.avatar_url AS rider_avatar_url,
      rp.video_url AS rider_video_url,
      u2.chill_score AS rider_chill_score,
      u2.completed_rides AS rider_completed_rides,
      p.is_cash
    FROM hmu_posts p
    LEFT JOIN rider_profiles rp ON rp.user_id = p.user_id
    LEFT JOIN users u2 ON u2.id = p.user_id
    LEFT JOIN rides r ON r.hmu_post_id = p.id AND r.status NOT IN ('cancelled')
    WHERE r.id IS NULL
      AND p.market_id = ${driverMarketId}
      AND NOT EXISTS (
        SELECT 1 FROM ride_interests ri
        WHERE ri.post_id = p.id
          AND ri.driver_id = ${driverUserId}
          AND ri.status = 'passed'
      )
      AND (
        -- Direct booking targeting this driver (not area-gated)
        (p.status = 'active'
          AND p.post_type = 'direct_booking'
          AND p.target_driver_id = ${driverUserId}
          AND p.booking_expires_at > NOW())
        OR
        -- Active broadcast OR locked preview of a passed direct booking.
        -- Same gate applies; for locked posts we additionally exclude the
        -- driver who already passed.
        (p.expires_at > NOW()
          AND (
            (p.status = 'active' AND p.post_type = 'rider_request')
            OR
            (p.status = 'declined_awaiting_rider' AND p.last_declined_by IS DISTINCT FROM ${driverUserId})
          )
          AND (
            -- Pickup gate
            (
              ${driverPrefs.services_entire_market ?? false}::boolean = TRUE
              OR (p.pickup_area_slug IS NOT NULL
                  AND p.pickup_area_slug = ANY(${driverAreaSlugs}::text[]))
              OR p.pickup_area_slug IS NULL
            )
            -- Dropoff gate (unchanged by entire-market — entire-market is about pickup coverage)
            AND (
              p.dropoff_in_market = TRUE
              OR ${driverPrefs.accepts_long_distance ?? false}::boolean = TRUE
            )
            -- When both pickup AND dropoff are inside the market and driver
            -- picked specific areas, require at least one side to match.
            AND (
              ${driverPrefs.services_entire_market ?? false}::boolean = TRUE
              OR p.pickup_area_slug IS NULL
              OR p.dropoff_area_slug IS NULL
              OR p.pickup_area_slug = ANY(${driverAreaSlugs}::text[])
              OR p.dropoff_area_slug = ANY(${driverAreaSlugs}::text[])
            )
          )
        )
      )
    ORDER BY p.created_at DESC
  `;

  const requests = rows.map((row: Record<string, unknown>) => {
    const tw = (row.time_window ?? {}) as Record<string, unknown>;
    const createdAt = new Date(row.created_at as string);
    const minutesAgo = (Date.now() - createdAt.getTime()) / 60000;
    const locked = row.status === 'declined_awaiting_rider';
    return {
      id: row.id,
      type: row.post_type === 'direct_booking' ? 'direct' : 'open',
      locked,
      riderName: row.rider_name ?? 'Rider',
      riderHandle: (row.rider_handle as string) || null,
      riderAvatarUrl: (row.rider_avatar_url as string) || null,
      riderVideoUrl: (row.rider_video_url as string) || null,
      riderChillScore: Number(row.rider_chill_score ?? 0),
      riderCompletedRides: Number(row.rider_completed_rides ?? 0),
      isCash: (row.is_cash as boolean) || false,
      pickupAreaSlug: (row.pickup_area_slug as string) || null,
      dropoffAreaSlug: (row.dropoff_area_slug as string) || null,
      dropoffInMarket: row.dropoff_in_market !== false,
      destination: tw.destination ?? tw.message ?? tw.note ?? '',
      time: tw.time ?? '',
      stops: tw.stops ?? '',
      roundTrip: tw.round_trip === true,
      price: Number(row.price ?? 0),
      expiresAt: row.booking_expires_at || row.expires_at,
      createdAt: row.created_at,
      riderOnline: minutesAgo < 30,
    };
  });

  // Cash-preference filtering
  type Req = typeof requests[number];
  let filtered: Req[] = requests;
  if (driverPrefs.cash_only) {
    filtered = requests.filter((r: Req) => r.isCash === true);
  } else if (!driverPrefs.accepts_cash) {
    filtered = [
      ...requests.filter((r: Req) => r.isCash !== true),
      ...requests.filter((r: Req) => r.isCash === true),
    ];
  }

  return NextResponse.json({ requests: filtered });
}
