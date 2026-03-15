import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import { logAdminAction } from '@/lib/admin/log';
import sql from '@/lib/admin/db';

interface ResolveBody {
  resolution: string;
  action: 'payout' | 'refund' | 'none';
  refund_amount?: number;
  admin_notes?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { id } = await params;

  let body: ResolveBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { resolution, action, refund_amount = 0, admin_notes } = body;

  if (!resolution || !action) {
    return NextResponse.json({ error: 'resolution and action are required' }, { status: 400 });
  }

  // Fetch dispute + ride in one shot
  const [dispute] = await sql`
    SELECT d.*, r.rider_id, r.driver_id, r.total_fare
    FROM disputes d
    JOIN rides r ON r.id = d.ride_id
    WHERE d.id = ${id}
    LIMIT 1
  `;

  if (!dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  if (dispute.status === 'resolved' || dispute.status === 'closed') {
    return NextResponse.json({ error: 'Dispute already resolved' }, { status: 409 });
  }

  // Run resolve + optional transaction atomically
  await sql.transaction(async (tx) => {
    await tx`
      UPDATE disputes
      SET
        status               = 'resolved',
        resolution           = ${resolution},
        refund_amount        = ${refund_amount},
        admin_notes          = ${admin_notes ?? ''},
        resolved_by_admin_id = ${auth.userId},
        resolved_at          = NOW(),
        updated_at           = NOW()
      WHERE id = ${id}
    `;

    if (action === 'refund' && refund_amount > 0) {
      await tx`
        INSERT INTO transactions
          (user_id, ride_id, transaction_type, amount, currency, status,
           description, metadata, created_at)
        VALUES
          (${dispute.rider_id}, ${dispute.ride_id}, 'refund', ${refund_amount},
           'USD', 'pending',
           ${'Admin refund: dispute ' + id},
           ${JSON.stringify({ dispute_id: id, resolved_by: auth.userId })}::jsonb,
           NOW())
      `;
    }

    if (action === 'payout' && refund_amount > 0) {
      await tx`
        INSERT INTO transactions
          (user_id, ride_id, transaction_type, amount, currency, status,
           description, metadata, created_at)
        VALUES
          (${dispute.driver_id}, ${dispute.ride_id}, 'payout', ${refund_amount},
           'USD', 'pending',
           ${'Admin payout: dispute ' + id},
           ${JSON.stringify({ dispute_id: id, resolved_by: auth.userId })}::jsonb,
           NOW())
      `;
    }
  });

  await logAdminAction(auth.userId, 'resolve_dispute', 'dispute', id, {
    action,
    refund_amount,
    resolution,
  });

  return NextResponse.json({ success: true, dispute_id: id, action });
}
