// POST /api/rider/linked/[driverId]/unlink — rider removes a driver from their
// linked list. Status → 'unlinked', rider is re-masked to that driver. Does NOT
// block the driver (unlike dismiss); driver can theoretically re-HMU later unless
// the rider also blocks them separately.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ driverId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { driverId } = await params;

  const rows = await sql`
    UPDATE driver_to_rider_hmus
    SET status = 'unlinked', unlinked_at = NOW()
    WHERE rider_id = ${user.id}
      AND driver_id = ${driverId}
      AND status = 'linked'
    RETURNING id
  `;
  if (!rows.length) {
    return NextResponse.json({ error: 'No active link' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
