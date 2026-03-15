import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import sql from '../../../../../lib/db/client';
import { redis } from '../../../../../lib/notifications/redis';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:admin:flags',
});

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { success } = await ratelimit.limit(userId);
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.publicMetadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

// 300ft ≈ 91.44 meters. Haversine distance between two lat/lng points.
// Returns distance in meters using Postgres earthdistance or inline trig.
const GEO_THRESHOLD_METERS = 91.44;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rejection = await requireAdmin(req);
  if (rejection) return rejection;

  try {
    // 1. Users with 3+ weirdo ratings from different raters
    const weirdoFlags = await sql`
      SELECT
        rated_id AS user_id,
        COUNT(DISTINCT rater_id) AS weirdo_rater_count
      FROM ratings
      WHERE rating_type = 'weirdo'
      GROUP BY rated_id
      HAVING COUNT(DISTINCT rater_id) >= 3
    `;

    // 2. Users with 3+ disputes filed against them in last 30 days
    const disputeFlags = await sql`
      SELECT
        r.driver_id AS user_id,
        COUNT(d.id) AS dispute_count,
        'driver'    AS role
      FROM disputes d
      JOIN rides r ON r.id = d.ride_id
      WHERE d.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY r.driver_id
      HAVING COUNT(d.id) >= 3

      UNION ALL

      SELECT
        r.rider_id  AS user_id,
        COUNT(d.id) AS dispute_count,
        'rider'     AS role
      FROM disputes d
      JOIN rides r ON r.id = d.ride_id
      WHERE d.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY r.rider_id
      HAVING COUNT(d.id) >= 3
    `;

    // 3. Rides with geo mismatch on end
    //    Both confirmed end, but last GPS point > 300ft from declared dropoff
    //    Haversine in Postgres: distance = 6371000 * 2 * asin(sqrt(...)) meters
    const geoMismatchRides = await sql`
      SELECT
        r.id          AS ride_id,
        r.driver_id,
        r.rider_id,
        r.status,
        last_loc.lat  AS last_lat,
        last_loc.lng  AS last_lng,
        (r.dropoff->>'lat')::float AS dropoff_lat,
        (r.dropoff->>'lng')::float AS dropoff_lng,
        6371000 * 2 * asin(sqrt(
          power(sin(radians(((r.dropoff->>'lat')::float - last_loc.lat) / 2)), 2) +
          cos(radians(last_loc.lat)) *
          cos(radians((r.dropoff->>'lat')::float)) *
          power(sin(radians(((r.dropoff->>'lng')::float - last_loc.lng) / 2)), 2)
        )) AS distance_meters
      FROM rides r
      JOIN LATERAL (
        SELECT lat, lng
        FROM ride_locations
        WHERE ride_id = r.id
        ORDER BY recorded_at DESC
        LIMIT 1
      ) last_loc ON true
      WHERE r.driver_confirmed_end = true
        AND r.status IN ('ended', 'completed')
      HAVING 6371000 * 2 * asin(sqrt(
        power(sin(radians(((r.dropoff->>'lat')::float - last_loc.lat) / 2)), 2) +
        cos(radians(last_loc.lat)) *
        cos(radians((r.dropoff->>'lat')::float)) *
        power(sin(radians(((r.dropoff->>'lng')::float - last_loc.lng) / 2)), 2)
      )) > ${GEO_THRESHOLD_METERS}
    `;

    // 4. Retaliation flags from disputes
    //    A retaliation flag exists when both parties in a ride have filed disputes against each other
    const retaliationFlags = await sql`
      SELECT
        d1.ride_id,
        d1.filed_by AS filer_a,
        d2.filed_by AS filer_b
      FROM disputes d1
      JOIN disputes d2
        ON d1.ride_id = d2.ride_id
        AND d1.filed_by != d2.filed_by
        AND d1.id < d2.id
    `;

    return NextResponse.json({
      weirdo_flags:      weirdoFlags,
      dispute_flags:     disputeFlags,
      geo_mismatch_rides: geoMismatchRides,
      retaliation_flags: retaliationFlags,
    });
  } catch (err) {
    console.error('[admin/flags] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
