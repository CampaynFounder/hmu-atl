// GET /api/driver/blast-matches — blast matches where this driver was selected.
// Only returns blasts where selected_at IS NOT NULL (i.e., rider chose this driver).
// Blasts the driver HMU'd but wasn't picked are excluded.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverId = (userRows[0] as { id: string }).id;

  const rows = await sql`
    SELECT
      bdt.id          AS target_id,
      bdt.blast_id,
      bdt.hmu_at,
      bdt.selected_at,
      bdt.pull_up_at,
      hp.price,
      hp.pickup_address,
      hp.dropoff_address,
      hp.status       AS blast_status,
      hp.scheduled_for,
      r.id            AS ride_id,
      r.status        AS ride_status,
      r.started_at,
      r.ended_at,
      r.final_agreed_price,
      COALESCE(rp.display_name, rp.handle, 'Rider') AS rider_name
    FROM blast_driver_targets bdt
    JOIN hmu_posts hp ON hp.id = bdt.blast_id
    LEFT JOIN rides r
      ON r.hmu_post_id = bdt.blast_id
     AND r.driver_id  = bdt.driver_id
     AND r.status NOT IN ('cancelled')
    LEFT JOIN rider_profiles rp ON rp.user_id = hp.user_id
    WHERE bdt.driver_id   = ${driverId}
      AND bdt.selected_at IS NOT NULL
    ORDER BY bdt.selected_at DESC
    LIMIT 20
  `;

  return NextResponse.json({
    matches: rows.map((r: unknown) => {
      const row = r as Record<string, unknown>;
      return {
        targetId:       row.target_id as string,
        blastId:        row.blast_id as string,
        rideId:         (row.ride_id as string) ?? null,
        rideStatus:     (row.ride_status as string) ?? null,
        blastStatus:    row.blast_status as string,
        price:          Number(row.price ?? 0),
        finalPrice:     row.final_agreed_price != null ? Number(row.final_agreed_price) : null,
        pickupAddress:  (row.pickup_address as string) ?? null,
        dropoffAddress: (row.dropoff_address as string) ?? null,
        riderName:      row.rider_name as string,
        selectedAt:     row.selected_at as string,
        pullUpAt:       (row.pull_up_at as string) ?? null,
        startedAt:      (row.started_at as string) ?? null,
        endedAt:        (row.ended_at as string) ?? null,
      };
    }),
  });
}
