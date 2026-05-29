// POST /api/delivery/[id]/location
// Courier GPS heartbeat. Mirrors rides/[id]/location pattern exactly.

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const parsed = LocationSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });

    const { rows: [delivery] } = await pool.query(
      `SELECT id FROM delivery_requests
       WHERE id = $1 AND courier_id = $2
         AND status IN ('courier_accepted','at_merchant','receipt_uploaded','en_route','delivered')`,
      [id, user.id],
    );

    if (!delivery) return NextResponse.json({ error: 'Not found or not active' }, { status: 404 });

    await pool.query(
      `INSERT INTO delivery_locations (delivery_id, actor_id, lat, lng) VALUES ($1, $2, $3, $4)`,
      [id, user.id, parsed.data.lat, parsed.data.lng],
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[delivery/location]', err);
    return NextResponse.json({ error: 'Failed to record location' }, { status: 500 });
  }
}
