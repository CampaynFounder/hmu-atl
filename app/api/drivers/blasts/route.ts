// GET /api/drivers/blasts — driver's consolidated blast HMU view.
// Returns all blasts where this driver has HMU'd and the outcome is
// still pending (waiting for rider to Pull Up on them) or won (ride is live).
// Used by DriverBlastStatusSection on both /driver/home and /driver/requests.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverUserId = (userRows[0] as { id: string }).id;

  const rows = await sql`
    SELECT
      p.id           AS blast_id,
      p.price,
      p.expires_at,
      p.scheduled_for,
      p.pickup_address,
      p.dropoff_address,
      p.status       AS blast_status,
      COALESCE(rp.handle, rp.display_name, 'Rider') AS rider_name,
      COALESCE(rp.thumbnail_url, rp.avatar_url)       AS rider_avatar_url,
      bdt.id         AS target_id,
      bdt.hmu_at,
      bdt.selected_at,
      bdt.pull_up_at,
      bdt.rejected_at,
      r.id           AS ride_id,
      r.status       AS ride_status
    FROM blast_driver_targets bdt
    JOIN hmu_posts p ON p.id = bdt.blast_id
    LEFT JOIN rider_profiles rp ON rp.user_id = p.user_id
    LEFT JOIN rides r
      ON r.hmu_post_id = p.id
     AND r.driver_id   = ${driverUserId}
    WHERE bdt.driver_id  = ${driverUserId}
      AND bdt.hmu_at     IS NOT NULL
      AND bdt.passed_at  IS NULL
      AND (
        -- Waiting: blast still active, rider hasn't picked anyone else yet
        (p.status = 'active' AND bdt.rejected_at IS NULL AND p.expires_at > NOW())
        OR
        -- Driver was selected: show until ride is terminal
        (bdt.selected_at IS NOT NULL
          AND (r.id IS NULL OR r.status NOT IN ('completed', 'cancelled')))
      )
    ORDER BY bdt.hmu_at DESC
  `;

  const blasts = rows.map((row: Record<string, unknown>) => {
    const scheduledFor = row.scheduled_for ? new Date(row.scheduled_for as string) : null;
    const timeLabel = (() => {
      if (!scheduledFor) return 'ASAP';
      const minutes = Math.round((scheduledFor.getTime() - Date.now()) / 60_000);
      if (minutes <= 5) return 'Now';
      if (minutes < 60) return `in ${minutes} min`;
      const hours = Math.round(minutes / 60);
      if (hours < 12) return `in ~${hours}h`;
      return scheduledFor.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    })();

    const status: 'waiting' | 'won' | 'taken' =
      row.selected_at ? 'won' :
      row.rejected_at ? 'taken' :
      'waiting';

    return {
      blastId: row.blast_id as string,
      targetId: row.target_id as string,
      price: Number(row.price),
      timeLabel,
      scheduledFor: row.scheduled_for as string | null,
      pickupAddress: (row.pickup_address as string) || null,
      dropoffAddress: (row.dropoff_address as string) || null,
      blastStatus: row.blast_status as string,
      riderName: row.rider_name as string,
      riderAvatarUrl: (row.rider_avatar_url as string) || null,
      hmuAt: row.hmu_at as string,
      status,
      rideId: (row.ride_id as string) || null,
      rideStatus: (row.ride_status as string) || null,
      expiresAt: row.expires_at as string,
    };
  });

  return NextResponse.json({ blasts });
}
