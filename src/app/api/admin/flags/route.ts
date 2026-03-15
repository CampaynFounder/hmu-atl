import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import sql from '@/lib/admin/db';

export interface FlagEntry {
  flag_type: 'weirdo_x3' | 'dispute_x3' | 'geo_mismatch' | 'retaliation';
  user_id: string;
  user_name: string;
  user_phone: string;
  count?: number;
  ride_id?: string;
  detail?: string;
  flagged_at: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const [weirdoFlags, disputeFlags, geoMismatchFlags, retaliationFlags] =
    await Promise.all([
      // WEIRDO ×3 — users with 3+ reviews flagged with reason 'WEIRDO'
      sql<FlagEntry[]>`
        SELECT
          'weirdo_x3'::text       AS flag_type,
          u.id                    AS user_id,
          u.full_name             AS user_name,
          u.phone_number          AS user_phone,
          COUNT(rr.id)::int       AS count,
          NULL::text              AS ride_id,
          NULL::text              AS detail,
          MAX(rr.created_at)::text AS flagged_at
        FROM ratings_and_reviews rr
        JOIN users u ON u.id = rr.rated_user_id
        WHERE rr.is_flagged = true
          AND rr.flagged_reason ILIKE '%WEIRDO%'
        GROUP BY u.id, u.full_name, u.phone_number
        HAVING COUNT(rr.id) >= 3
        ORDER BY count DESC
      `,

      // Dispute ×3 in 30 days — users with 3+ disputes raised against them in the last 30 days
      sql<FlagEntry[]>`
        SELECT
          'dispute_x3'::text       AS flag_type,
          u.id                     AS user_id,
          u.full_name              AS user_name,
          u.phone_number           AS user_phone,
          COUNT(d.id)::int         AS count,
          NULL::text               AS ride_id,
          NULL::text               AS detail,
          MAX(d.created_at)::text  AS flagged_at
        FROM disputes d
        JOIN rides r ON r.id = d.ride_id
        JOIN users u ON u.id = r.driver_id OR u.id = r.rider_id
        WHERE d.created_at >= NOW() - INTERVAL '30 days'
          AND u.id != d.raised_by_user_id
        GROUP BY u.id, u.full_name, u.phone_number
        HAVING COUNT(d.id) >= 3
        ORDER BY count DESC
      `,

      // Geo mismatch — completed rides where actual GPS distance deviates > 20% from estimated
      sql<FlagEntry[]>`
        SELECT
          'geo_mismatch'::text                   AS flag_type,
          u.id                                   AS user_id,
          u.full_name                            AS user_name,
          u.phone_number                         AS user_phone,
          NULL::int                              AS count,
          r.id                                   AS ride_id,
          ROUND(
            ABS(r.actual_distance_km - r.estimated_distance_km)
            / NULLIF(r.estimated_distance_km, 0) * 100
          )::text || '% deviation'              AS detail,
          r.completed_at::text                   AS flagged_at
        FROM rides r
        JOIN users u ON u.id = r.driver_id
        WHERE r.status = 'completed'
          AND r.actual_distance_km IS NOT NULL
          AND r.estimated_distance_km IS NOT NULL
          AND r.estimated_distance_km > 0
          AND ABS(r.actual_distance_km - r.estimated_distance_km)
              / r.estimated_distance_km > 0.20
          AND r.completed_at >= NOW() - INTERVAL '30 days'
        ORDER BY r.completed_at DESC
        LIMIT 100
      `,

      // Retaliation — low rating given by a user within 1 hour of filing a dispute
      sql<FlagEntry[]>`
        SELECT DISTINCT
          'retaliation'::text      AS flag_type,
          u.id                     AS user_id,
          u.full_name              AS user_name,
          u.phone_number           AS user_phone,
          NULL::int                AS count,
          rr.ride_id               AS ride_id,
          'Rating ' || rr.rating::text || '/5 posted within 1h of dispute' AS detail,
          rr.created_at::text      AS flagged_at
        FROM ratings_and_reviews rr
        JOIN disputes d
          ON d.ride_id = rr.ride_id
         AND d.raised_by_user_id = rr.rater_user_id
         AND rr.created_at BETWEEN d.created_at AND d.created_at + INTERVAL '1 hour'
        JOIN users u ON u.id = rr.rater_user_id
        WHERE rr.rating <= 2
        ORDER BY rr.created_at DESC
        LIMIT 100
      `,
    ]);

  const flags: FlagEntry[] = [
    ...weirdoFlags,
    ...disputeFlags,
    ...geoMismatchFlags,
    ...retaliationFlags,
  ];

  return NextResponse.json({ flags, total: flags.length });
}
