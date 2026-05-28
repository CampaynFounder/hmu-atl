// GET /api/blast/[id]/targets
// Returns all driver targets for a blast with full profile data so the rider
// can swipe through them in the blast deck. Only the blast owner can view.
// Includes distance from the blast's pickup location, acceptance rate,
// and rating breakdowns for each targeted driver.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId } = await params;

  // Verify rider owns this blast
  const blastRows = await sql`
    SELECT p.id, p.status, p.expires_at,
           p.time_window,
           u.id AS rider_id
    FROM hmu_posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${blastId}
      AND u.clerk_id = ${clerkId}
      AND p.post_type IN ('blast', 'rider_request')
    LIMIT 1
  `;
  if (!blastRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const blast = blastRows[0] as {
    id: string; status: string; expires_at: string;
    time_window: Record<string, unknown> | null;
  };

  // Extract pickup coords from time_window JSONB
  const tw = blast.time_window ?? {};
  const pickupLat = typeof tw.pickup === 'object' && tw.pickup !== null
    ? Number((tw.pickup as Record<string, unknown>).lat ?? 0)
    : 0;
  const pickupLng = typeof tw.pickup === 'object' && tw.pickup !== null
    ? Number((tw.pickup as Record<string, unknown>).lng ?? 0)
    : 0;
  const hasPickup = pickupLat !== 0 && pickupLng !== 0;

  const rows = await sql`
    SELECT
      bdt.id              AS target_id,
      bdt.driver_id,
      bdt.hmu_at,
      bdt.passed_at,
      bdt.hmu_counter_price,
      bdt.match_score,
      dp.handle,
      dp.display_name,
      dp.video_url,
      dp.show_video_on_link,
      dp.vehicle_info,
      dp.pricing,
      dp.accepts_down_bad,
      u.tier,
      u.chill_score,
      -- Acceptance rate: ≥3 resolved offers required
      (
        SELECT
          CASE WHEN SUM(ac.offered) >= 3
               THEN ROUND(SUM(ac.accepted)::numeric / NULLIF(SUM(ac.offered), 0) * 100)::int
               ELSE NULL END
        FROM (
          SELECT
            COUNT(*) FILTER (WHERE hp2.status = 'matched') AS accepted,
            COUNT(*) FILTER (WHERE hp2.status IN ('matched','declined_awaiting_rider')) AS offered
          FROM hmu_posts hp2
          WHERE hp2.target_driver_id = dp.user_id
            AND hp2.post_type = 'direct_booking'
            AND hp2.created_at > NOW() - INTERVAL '90 days'
          UNION ALL
          SELECT
            COUNT(*) FILTER (WHERE bdt2.hmu_at IS NOT NULL) AS accepted,
            COUNT(*) FILTER (WHERE bdt2.hmu_at IS NOT NULL OR bdt2.passed_at IS NOT NULL OR bdt2.rejected_at IS NOT NULL) AS offered
          FROM blast_driver_targets bdt2
          WHERE bdt2.driver_id = dp.user_id
            AND bdt2.notified_at IS NOT NULL
            AND bdt2.notified_at > NOW() - INTERVAL '90 days'
        ) ac
      ) AS acceptance_rate,
      -- Rating counts
      (
        SELECT json_build_object(
          'chill',       COALESCE(COUNT(*) FILTER (WHERE rating_type = 'chill'), 0),
          'cool_af',     COALESCE(COUNT(*) FILTER (WHERE rating_type = 'cool_af'), 0),
          'kinda_creepy',COALESCE(COUNT(*) FILTER (WHERE rating_type = 'kinda_creepy'), 0),
          'weirdo',      COALESCE(COUNT(*) FILTER (WHERE rating_type = 'weirdo'), 0)
        )
        FROM ratings
        WHERE rated_id = u.id
      ) AS ratings,
      -- Distance from blast pickup (Haversine, best available driver location)
      CASE
        WHEN ${hasPickup}::boolean AND dp.current_lat IS NOT NULL
             AND dp.location_updated_at > NOW() - INTERVAL '15 minutes'
        THEN ROUND((2 * 3959 * ASIN(SQRT(
          POWER(SIN(RADIANS(dp.current_lat  - ${pickupLat}::numeric) / 2), 2)
          + COS(RADIANS(${pickupLat}::numeric)) * COS(RADIANS(dp.current_lat))
          * POWER(SIN(RADIANS(dp.current_lng - ${pickupLng}::numeric) / 2), 2)
        )))::numeric, 1)
        WHEN ${hasPickup}::boolean AND dp.home_lat IS NOT NULL
        THEN ROUND((2 * 3959 * ASIN(SQRT(
          POWER(SIN(RADIANS(dp.home_lat  - ${pickupLat}::numeric) / 2), 2)
          + COS(RADIANS(${pickupLat}::numeric)) * COS(RADIANS(dp.home_lat))
          * POWER(SIN(RADIANS(dp.home_lng - ${pickupLng}::numeric) / 2), 2)
        )))::numeric, 1)
        ELSE NULL
      END AS distance_mi
    FROM blast_driver_targets bdt
    JOIN driver_profiles dp ON dp.user_id = bdt.driver_id
    JOIN users u ON u.id = bdt.driver_id
    WHERE bdt.blast_id = ${blastId}
    ORDER BY bdt.match_score DESC NULLS LAST, bdt.notified_at ASC
  `;

  const targets = rows.map((r: Record<string, unknown>) => {
    const vi = r.vehicle_info as Record<string, unknown> | null;
    const pricing = r.pricing as Record<string, unknown> | null;
    const ratings = r.ratings as Record<string, number> | null;
    return {
      targetId:       r.target_id as string,
      driverId:       r.driver_id as string,
      handle:         r.handle as string,
      displayName:    (r.display_name as string) || (r.handle as string),
      videoUrl:       r.show_video_on_link === false ? null : ((r.video_url as string) || null),
      photoUrl:       (vi?.photo_url as string) || null,
      minPrice:       Number(pricing?.minimum ?? 0),
      vehicleSummary: vi?.make ? `${vi.year ?? ''} ${vi.make} ${vi.model ?? ''}`.trim() : null,
      tier:           r.tier as string,
      chillScore:     Number(r.chill_score ?? 0),
      acceptanceRate: r.acceptance_rate != null ? Number(r.acceptance_rate) : null,
      distanceMi:     r.distance_mi != null ? Number(r.distance_mi) : null,
      ratings: {
        chill:       Number(ratings?.chill ?? 0),
        coolAf:      Number(ratings?.cool_af ?? 0),
        kindaCreepy: Number(ratings?.kinda_creepy ?? 0),
        weirdo:      Number(ratings?.weirdo ?? 0),
      },
      hmuAt:     (r.hmu_at as string) || null,
      passedAt:  (r.passed_at as string) || null,
      counterPrice: r.hmu_counter_price != null ? Number(r.hmu_counter_price) : null,
      matchScore: Number(r.match_score ?? 0),
    };
  });

  return NextResponse.json({
    targets,
    blast: {
      id: blast.id,
      status: blast.status,
      expiresAt: blast.expires_at,
    },
  });
}
