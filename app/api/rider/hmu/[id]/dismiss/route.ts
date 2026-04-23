// POST /api/rider/hmu/[id]/dismiss — rider declines an HMU. Flips status to 'dismissed'
// AND inserts a one-way row in blocked_users (rider → driver). Result: this driver
// never sees this rider again in /driver/find-riders, cannot re-HMU. Rider can still
// independently find the driver via /rider/browse.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const rows = await sql`
    UPDATE driver_to_rider_hmus
    SET status = 'dismissed', dismissed_at = NOW()
    WHERE id = ${id}
      AND rider_id = ${user.id}
      AND status IN ('active','linked')
    RETURNING driver_id
  `;
  if (!rows.length) {
    return NextResponse.json({ error: 'HMU not found' }, { status: 404 });
  }
  const driverId = rows[0].driver_id as string;

  // Soft block — driver won't surface to this rider in discovery / cannot re-HMU.
  // No-op if the pair is already blocked (e.g., from a prior interaction).
  await sql`
    INSERT INTO blocked_users (blocker_id, blocked_id)
    VALUES (${user.id}, ${driverId})
    ON CONFLICT DO NOTHING
  `;

  // Clear the incoming badge for this HMU
  await sql`
    UPDATE user_notifications
    SET read_at = NOW()
    WHERE user_id = ${user.id}
      AND type = 'hmu_received'
      AND read_at IS NULL
      AND (payload->>'hmuId') = ${id}
  `;

  // No driver-side notification — silent block per product spec
  return NextResponse.json({ ok: true });
}
