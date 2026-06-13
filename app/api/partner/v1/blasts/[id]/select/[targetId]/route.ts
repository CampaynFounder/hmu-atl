// POST /api/partner/v1/blasts/{id}/select/{targetId} — pick a winning driver.
// Creates the ride + places the delivery-fee hold (folds into partner_bookings,
// so /complete + /cancel work after). Auth: blasts:write.

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/partner/auth';
import { selectPartnerBlastDriver } from '@/lib/partner/blast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; targetId: string }> }) {
  const rawBody = await req.text();
  const auth = await authenticatePartner(req, rawBody, 'blasts:write');
  if (!auth.ok) return auth.res;
  const { id, targetId } = await params;
  const result = await selectPartnerBlastDriver(auth.ctx, id, targetId);
  if (result.ok) {
    return NextResponse.json({ booking_id: result.data.bookingId, ride_id: result.data.rideId, driver_id: result.data.driverId, status: 'accepted' });
  }
  return NextResponse.json({ error: result.error, message: result.message }, { status: result.httpStatus });
}
