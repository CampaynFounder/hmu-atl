// POST /api/delivery/[id]/en-route
// Courier departs merchant, heading to customer. receipt_uploaded → en_route.

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
       SET status = 'en_route', en_route_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND courier_id = $2 AND status = 'receipt_uploaded'
       RETURNING id`,
      [id, user.id],
    );

    if (!rows[0]) return NextResponse.json({ error: 'Invalid transition' }, { status: 409 });

    return NextResponse.json({ status: 'en_route' });
  } catch (err) {
    console.error('[delivery/en-route]', err);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
