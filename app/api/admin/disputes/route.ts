// GET /api/admin/disputes — Dispute queue
// PATCH /api/admin/disputes — Resolve a dispute
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { resolveActionItem } from '@/lib/admin/action-items';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') ?? 'open';

  const disputes = await sql`
    SELECT
      d.id, d.ride_id, d.filed_by, d.reason, d.status,
      d.created_at,
      COALESCE(r.final_agreed_price, r.amount) as ride_amount,
      r.status as ride_status, r.pickup, r.dropoff,
      r.created_at as ride_created_at,
      COALESCE(filer_rp.display_name, filer_rp.first_name) as filer_rider_name,
      COALESCE(filer_dp.display_name, filer_dp.first_name) as filer_driver_name,
      COALESCE(driver_p.display_name, driver_p.first_name) as driver_name,
      driver_p.handle as driver_handle,
      COALESCE(rider_p.display_name, rider_p.first_name) as rider_name,
      u_filer.profile_type as filer_type,
      (SELECT COUNT(*) FROM disputes WHERE filed_by = u_filer.id) as filer_dispute_count,
      COALESCE(u_filer.completed_rides, 0) as filer_completed_rides
    FROM disputes d
    JOIN rides r ON r.id = d.ride_id
    LEFT JOIN users u_filer ON u_filer.id = d.filed_by
    LEFT JOIN rider_profiles filer_rp ON filer_rp.user_id = d.filed_by
    LEFT JOIN driver_profiles filer_dp ON filer_dp.user_id = d.filed_by
    LEFT JOIN driver_profiles driver_p ON driver_p.user_id = r.driver_id
    LEFT JOIN rider_profiles rider_p ON rider_p.user_id = r.rider_id
    WHERE d.status = ${status}
    ORDER BY d.created_at ASC
    LIMIT 50
  `;

  return NextResponse.json({
    disputes: disputes.map((d: Record<string, unknown>) => ({
      id: d.id,
      rideId: d.ride_id,
      filedBy: d.filed_by,
      filerName: d.filer_rider_name || d.filer_driver_name || 'Unknown',
      filerType: d.filer_type,
      filerDisputeCount: Number(d.filer_dispute_count ?? 0),
      filerCompletedRides: Number(d.filer_completed_rides ?? 0),
      reason: d.reason,
      status: d.status,
      rideAmount: Number(d.ride_amount ?? 0),
      rideStatus: d.ride_status,
      pickup: d.pickup,
      dropoff: d.dropoff,
      driverName: d.driver_name ?? 'Unknown',
      driverHandle: d.driver_handle,
      riderName: d.rider_name ?? 'Unknown',
      rideCreatedAt: d.ride_created_at,
      createdAt: d.created_at,
      timeSinceFiled: d.created_at
        ? Math.round((Date.now() - new Date(d.created_at as string).getTime()) / 60000)
        : 0,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { disputeId, action, notes } = await req.json();
  if (!disputeId || !action) {
    return NextResponse.json({ error: 'disputeId and action required' }, { status: 400 });
  }

  const validActions = ['resolve_driver', 'resolve_rider', 'partial_refund', 'escalate', 'close'];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `Invalid action. Use: ${validActions.join(', ')}` }, { status: 400 });
  }

  const statusMap: Record<string, string> = {
    resolve_driver: 'resolved_driver',
    resolve_rider: 'resolved_rider',
    partial_refund: 'resolved_rider',
    escalate: 'under_review',
    close: 'closed',
  };

  const newStatus = statusMap[action];

  const rows = await sql`
    UPDATE disputes
    SET status = ${newStatus},
        resolved_at = CASE WHEN ${newStatus} IN ('resolved_driver', 'resolved_rider', 'closed') THEN NOW() ELSE resolved_at END
    WHERE id = ${disputeId}
    RETURNING id, ride_id, status
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  await logAdminAction(admin.id, `dispute_${action}`, 'dispute', disputeId, {
    newStatus,
    notes,
  });

  // Resolve action item when admin handles dispute
  await resolveActionItem('disputes', disputeId);

  return NextResponse.json({ success: true, dispute: rows[0] });
}
