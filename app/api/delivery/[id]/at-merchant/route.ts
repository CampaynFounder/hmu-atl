// POST /api/delivery/[id]/at-merchant
// Courier signals arrival at merchant. courier_accepted → at_merchant.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
       SET status = 'at_merchant', at_merchant_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND courier_id = $2 AND status = 'courier_accepted'
       RETURNING id, customer_id AS "customerId"`,
      [id, user.id],
    );

    if (!rows[0]) return NextResponse.json({ error: 'Invalid transition' }, { status: 409 });

    return NextResponse.json({ status: 'at_merchant' });
  } catch (err) {
    console.error('[delivery/at-merchant]', err);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
