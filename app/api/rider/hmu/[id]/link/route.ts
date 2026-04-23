// POST /api/rider/hmu/[id]/link — rider accepts an HMU. Flips status to 'linked',
// marks the rider notification as read, notifies driver. Unmasking is enforced
// at read time on the /driver/find-riders query — any 'linked' row reveals the
// rider's real profile to that specific driver.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { notifyUser } from '@/lib/ably/server';

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
    SET status = 'linked', linked_at = NOW()
    WHERE id = ${id}
      AND rider_id = ${user.id}
      AND status IN ('active')
    RETURNING driver_id
  `;
  if (!rows.length) {
    return NextResponse.json({ error: 'HMU not found or not linkable' }, { status: 404 });
  }
  const driverId = rows[0].driver_id as string;

  // Mark the arrival notification read so the badge count decrements
  await sql`
    UPDATE user_notifications
    SET read_at = NOW()
    WHERE user_id = ${user.id}
      AND type = 'hmu_received'
      AND read_at IS NULL
      AND (payload->>'hmuId') = ${id}
  `;

  // Persistent notification for driver so they see the accept even if offline
  await sql`
    INSERT INTO user_notifications (user_id, type, payload)
    VALUES (${driverId}, 'hmu_linked', ${JSON.stringify({ hmuId: id, riderId: user.id })}::jsonb)
  `;
  await notifyUser(driverId, 'hmu_linked', { hmuId: id, riderId: user.id });

  return NextResponse.json({ ok: true });
}
