import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import sql from '../../../../../../lib/db/client';
import { disputeRateLimit } from '../../../../../lib/rate-limit';
import { captureEvent } from '../../../../../lib/posthog-server';
import type { DisputeStatus } from '../../../../../../lib/db/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: disputeId } = await params;

  // Rate limiting
  const { success: rateLimitOk } = await disputeRateLimit.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Verify admin
  const admins = await sql`
    SELECT id FROM users
    WHERE auth_provider_id = ${userId}
      AND user_type = 'admin'
    LIMIT 1
  `;
  if (admins.length === 0) {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
  }
  const adminInternalId: string = admins[0].id;

  let body: {
    resolution: string;
    refund_amount?: number;
    admin_notes?: string;
    status?: DisputeStatus;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    resolution,
    refund_amount = 0,
    admin_notes,
    status = 'resolved',
  } = body;

  if (!resolution) {
    return NextResponse.json({ error: 'resolution is required' }, { status: 400 });
  }

  // Fetch dispute and associated ride
  const disputes = await sql`
    SELECT d.*, r.rider_id, r.driver_id
    FROM disputes d
    JOIN rides r ON r.id = d.ride_id
    WHERE d.id = ${disputeId}
    LIMIT 1
  `;

  if (disputes.length === 0) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const dispute = disputes[0];

  if (dispute.status === 'resolved' || dispute.status === 'closed') {
    return NextResponse.json({ error: 'Dispute is already resolved or closed' }, { status: 409 });
  }

  const resolvedStatus: DisputeStatus = status;

  // Resolve the dispute
  const resolved = await sql`
    UPDATE disputes
    SET status = ${resolvedStatus},
        resolution = ${resolution},
        refund_amount = ${refund_amount},
        admin_notes = ${admin_notes ?? dispute.admin_notes},
        resolved_by_admin_id = ${adminInternalId},
        resolved_at = NOW(),
        updated_at = NOW()
    WHERE id = ${disputeId}
    RETURNING *
  `;

  // Clear 'in_dispute' status from both profiles
  await Promise.all([
    sql`
      UPDATE rider_profiles
      SET in_dispute = false,
          updated_at = NOW()
      WHERE user_id = ${dispute.rider_id}
    `,
    sql`
      UPDATE driver_profiles
      SET in_dispute = false,
          updated_at = NOW()
      WHERE user_id = ${dispute.driver_id}
    `,
  ]);

  // PostHog event
  captureEvent(userId, 'dispute_resolved', {
    dispute_id: disputeId,
    ride_id: dispute.ride_id,
    resolution_status: resolvedStatus,
    refund_amount,
  });

  return NextResponse.json({ dispute: resolved[0] });
}
