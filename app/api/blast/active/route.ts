// GET /api/blast/active — returns the signed-in rider's current active blast,
// or { blast: null } if none exists.
//
// Used by:
//   - blast-form-client: check before submit so rider sees a confirmation
//     modal before their existing blast is cancelled
//   - rider-home-client: render the "Your blast is live" card

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ blast: null });

  const userRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ blast: null });
  const row0 = userRows[0] as { id: string; profile_type: string };
  if (row0.profile_type !== 'rider') return NextResponse.json({ blast: null });
  const riderId = row0.id;

  const rows = await sql`
    SELECT
      id,
      -- Prefer the dedicated column (post-migration); fall back to JSON/areas
      COALESCE(
        shortcode,
        time_window->>'shortcode',
        (
          SELECT replace(elem, 'shortcode:', '')
          FROM unnest(areas) AS elem
          WHERE elem LIKE 'shortcode:%'
          LIMIT 1
        )
      )                     AS shortcode,
      pickup_address,
      dropoff_address,
      price,
      expires_at
    FROM hmu_posts
    WHERE user_id   = ${riderId}
      AND post_type = 'blast'
      AND status    = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ blast: null });

  const row = rows[0] as {
    id: string;
    shortcode: string | null;
    pickup_address: string | null;
    dropoff_address: string | null;
    price: string;
    expires_at: string;
  };

  return NextResponse.json({
    blast: {
      id: row.id,
      shortcode: row.shortcode,
      pickupAddress: row.pickup_address ?? '',
      dropoffAddress: row.dropoff_address ?? '',
      price: Number(row.price),
      expiresAt: row.expires_at,
    },
  });
}
