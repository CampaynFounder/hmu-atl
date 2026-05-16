// GET /api/blast/[id] — live state of a blast for its rider.
// Used by the offer-board page (/rider/blast/[id]) on first load and as a
// poll fallback if Ably misses an event. Ably is the primary live-update
// channel.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { calculateDistance } from '@/lib/geo/distance';

// How fresh `driver_profiles.current_lat/lng` must be (matches the matching
// algorithm's staleness rule). Beyond this, fall through to home_lat/lng.
const CURRENT_LOCATION_FRESH_MS = 5 * 60 * 1000;

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  const postRows = await sql`
    SELECT
      id, user_id, status, price, expires_at,
      pickup_lat, pickup_lng, pickup_address,
      dropoff_lat, dropoff_lng, dropoff_address,
      trip_type, scheduled_for, storage_requested, driver_preference,
      deposit_amount, bump_count
    FROM hmu_posts
    WHERE id = ${id} AND post_type = 'blast' LIMIT 1
  `;
  if (!postRows.length) {
    return NextResponse.json({ error: 'Blast not found' }, { status: 404 });
  }
  const post = postRows[0] as Record<string, unknown>;

  if (post.user_id !== riderId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Targets that responded — surfaces driver info inline so the offer board
  // can render without secondary lookups. counter_price (v3) takes precedence
  // over hmu_counter_price (v2) when both are populated; backward-compat fall-
  // through keeps the existing /rider/blast/[id] board rendering correctly
  // until the v2 column is dropped (additive migration per contract §3 D-11).
  // NOT EXISTS subquery suppresses targets the rider has already swipe-passed
  // on the fallback deck (event_type='fallback_dismissed'). Those rows stay
  // in blast_driver_targets — the deck UI just hides them. DELETE on the
  // dismiss endpoint removes the event row so the card reappears on next poll.
  const targetRows = await sql`
    SELECT
      bdt.id AS target_id,
      bdt.driver_id,
      bdt.match_score,
      bdt.hmu_at,
      bdt.hmu_counter_price,
      bdt.counter_price,
      bdt.passed_at,
      bdt.selected_at,
      bdt.pull_up_at,
      bdt.rejected_at,
      bdt.notified_at,
      dp.handle,
      dp.display_name,
      dp.video_url,
      dp.thumbnail_url,
      dp.vehicle_info,
      dp.area_slugs,
      dp.lgbtq_friendly,
      dp.accepts_long_distance,
      dp.current_lat,
      dp.current_lng,
      dp.location_updated_at,
      dp.home_lat,
      dp.home_lng,
      dp.home_label,
      u.chill_score,
      u.tier,
      u.completed_rides
    FROM blast_driver_targets bdt
    JOIN driver_profiles dp ON dp.user_id = bdt.driver_id
    JOIN users u ON u.id = bdt.driver_id
    WHERE bdt.blast_id = ${id}
      AND NOT EXISTS (
        SELECT 1 FROM blast_driver_events bde
        WHERE bde.blast_id = bdt.blast_id
          AND bde.driver_id = bdt.driver_id
          AND bde.event_type = 'fallback_dismissed'
      )
    ORDER BY
      bdt.pull_up_at DESC NULLS LAST,
      bdt.selected_at DESC NULLS LAST,
      bdt.hmu_at DESC NULLS LAST,
      bdt.match_score DESC
  `;

  const riderPickup = {
    latitude: Number(post.pickup_lat),
    longitude: Number(post.pickup_lng),
  };

  // Separate fallback drivers (notified_at = NULL) from regular targets
  const regularTargets = targetRows.filter((r: unknown) => {
    const row = r as Record<string, unknown>;
    return row.notified_at !== null;
  });

  const fallbackTargets = targetRows.filter((r: unknown) => {
    const row = r as Record<string, unknown>;
    return row.notified_at === null;
  });

  return NextResponse.json({
    blast: {
      id: post.id,
      status: post.status,
      price: Number(post.price),
      expiresAt: post.expires_at,
      pickup: {
        lat: Number(post.pickup_lat),
        lng: Number(post.pickup_lng),
        address: post.pickup_address,
      },
      dropoff: {
        lat: Number(post.dropoff_lat),
        lng: Number(post.dropoff_lng),
        address: post.dropoff_address,
      },
      tripType: post.trip_type,
      scheduledFor: post.scheduled_for,
      storage: post.storage_requested,
      driverPreference: post.driver_preference,
      depositAmount: Number(post.deposit_amount ?? 0),
      bumpCount: Number(post.bump_count ?? 0),
    },
    targets: regularTargets.map((r: unknown) => {
      const row = r as Record<string, unknown>;
      // v3: counter_price wins; v2 hmu_counter_price is the backward-compat
      // fallback so this GET serves both the [id] and [shortcode] boards.
      const counter = row.counter_price !== null && row.counter_price !== undefined
        ? Number(row.counter_price)
        : row.hmu_counter_price !== null && row.hmu_counter_price !== undefined
          ? Number(row.hmu_counter_price)
          : null;
      return {
        targetId: row.target_id,
        driverId: row.driver_id,
        matchScore: Number(row.match_score),
        hmuAt: row.hmu_at,
        counterPrice: counter,
        passedAt: row.passed_at,
        selectedAt: row.selected_at,
        pullUpAt: row.pull_up_at ?? null,
        rejectedAt: row.rejected_at,
        notifiedAt: row.notified_at,
        driver: buildDriverInfo(row),
      };
    }),
    fallbackDrivers: fallbackTargets.map((r: unknown) => {
      const row = r as Record<string, unknown>;

      // distanceFromPickupMi = "how far the driver is from the rider RIGHT NOW".
      // Prefer fresh GPS; fall back to home_* if GPS is stale or missing.
      // null when the driver has neither — rider card just hides that pill.
      const locationUpdatedAt = row.location_updated_at
        ? new Date(row.location_updated_at as string).getTime()
        : null;
      const isGpsFresh =
        locationUpdatedAt != null
        && Date.now() - locationUpdatedAt < CURRENT_LOCATION_FRESH_MS
        && row.current_lat != null
        && row.current_lng != null;

      const liveCoord = isGpsFresh
        ? { latitude: Number(row.current_lat), longitude: Number(row.current_lng) }
        : row.home_lat != null && row.home_lng != null
          ? { latitude: Number(row.home_lat), longitude: Number(row.home_lng) }
          : null;

      const distanceFromPickupMi = liveCoord
        ? Math.round(calculateDistance(riderPickup, liveCoord) * 10) / 10
        : null;

      // distanceFromHomeMi = pickup → driver's home base. Null when the driver
      // hasn't set a home. Surfaces "X mi from their home" on the rider card.
      const homeCoord = row.home_lat != null && row.home_lng != null
        ? { latitude: Number(row.home_lat), longitude: Number(row.home_lng) }
        : null;
      const distanceFromHomeMi = homeCoord
        ? Math.round(calculateDistance(riderPickup, homeCoord) * 10) / 10
        : null;

      return {
        targetId: row.target_id,
        driverId: row.driver_id,
        matchScore: Number(row.match_score),
        distanceFromPickupMi,
        distanceFromHomeMi,
        // True when the rider card's "X mi away" reflects real-time GPS,
        // false when it's the driver's static home. Lets the UI decorate
        // the pill (e.g. green dot) only when the location is live.
        locationIsLive: isGpsFresh,
        homeLabel: (row.home_label as string | null) ?? null,
        driver: buildDriverInfo(row),
      };
    }),
  });
}

function buildDriverInfo(row: Record<string, unknown>) {
  const vi = row.vehicle_info as Record<string, unknown> | null;
  const vehicleLabel = vi
    ? [vi.year, vi.make, vi.model].filter(Boolean).join(' ') || null
    : null;
  const vehicleColor = (vi?.color as string) || null;
  const vehiclePhotoUrl = (vi?.photo_url as string) || null;
  const maxRiders =
    vi ? (Number(vi.max_adults ?? 0) + Number(vi.max_children ?? 0)) || null : null;
  const areaSlugs = Array.isArray(row.area_slugs) ? (row.area_slugs as string[]) : [];
  return {
    handle: row.handle as string | null,
    displayName: row.display_name as string | null,
    videoUrl: row.video_url as string | null,
    thumbnailUrl: row.thumbnail_url as string | null,
    vehicleLabel,
    vehicleColor,
    vehiclePhotoUrl,
    maxRiders,
    areaSlugs,
    lgbtqFriendly: Boolean(row.lgbtq_friendly),
    acceptsLongDistance: Boolean(row.accepts_long_distance),
    chillScore: Number(row.chill_score ?? 0),
    completedRides: Number(row.completed_rides ?? 0),
    tier: row.tier as string | null,
  };
}
