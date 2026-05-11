// POST /api/admin/hmus/[id]/revoke — admin kills an HMU.
// Sets status='expired' and inserts a blocked_users row (rider blocks driver) so
// the driver can't simply resend. Admin action is logged for auditing.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.hmus.edit')) return unauthorizedResponse();

  const { id } = await params;

  const rows = await sql`
    UPDATE driver_to_rider_hmus
    SET status = 'expired'
    WHERE id = ${id}
      AND status IN ('active','linked')
    RETURNING driver_id, rider_id
  `;
  if (!rows.length) {
    return NextResponse.json({ error: 'HMU not found or already closed' }, { status: 404 });
  }

  const driverId = rows[0].driver_id as string;
  const riderId = rows[0].rider_id as string;

  // Block so the driver can't reopen the channel to this rider.
  await sql`
    INSERT INTO blocked_users (blocker_id, blocked_id, reason)
    VALUES (${riderId}, ${driverId}, 'admin_revoke')
    ON CONFLICT DO NOTHING
  `;

  await logAdminAction(admin.id, 'hmu_revoke', 'driver_to_rider_hmus', id, {
    driverId, riderId,
  });

  return NextResponse.json({ ok: true });
}
