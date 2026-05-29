// POST /api/delivery/[id]/cancel
// Customer or courier cancels. Releases Stripe hold if placed.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CANCELLABLE_STATUSES = ['pending', 'courier_accepted', 'at_merchant'];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { rows } = await pool.query(
      `UPDATE delivery_requests
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1
         AND status = ANY($2::delivery_status[])
         AND (customer_id = $3 OR courier_id = $3)
       RETURNING id, payment_intent_id AS "paymentIntentId"`,
      [id, CANCELLABLE_STATUSES, user.id],
    );

    if (!rows[0]) {
      return NextResponse.json({ error: 'Cannot cancel this delivery' }, { status: 409 });
    }

    // TODO: release Stripe hold if payment_intent_id is set
    // if (rows[0].paymentIntentId) {
    //   await stripe.paymentIntents.cancel(rows[0].paymentIntentId);
    // }

    return NextResponse.json({ status: 'cancelled' });
  } catch (err) {
    console.error('[delivery/cancel]', err);
    return NextResponse.json({ error: 'Failed to cancel delivery' }, { status: 500 });
  }
}
