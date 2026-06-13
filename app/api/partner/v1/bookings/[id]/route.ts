// DELETE /api/partner/v1/bookings/{id} — cancel a booking before capture.
// {id} is the booking_id returned by create (the underlying post id).
// Releases any held delivery-fee authorization. 409 if already captured.

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/partner/auth';
import { cancelPartnerBooking } from '@/lib/partner/booking-cancel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // DELETE carries no body; the signature is over the empty string.
  const auth = await authenticatePartner(req, '', 'bookings:write');
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const result = await cancelPartnerBooking(auth.ctx.partner.id, id);

  if (result.ok) {
    return NextResponse.json({ booking_id: id, status: 'cancelled' });
  }
  return NextResponse.json({ error: result.error, message: result.message }, { status: result.httpStatus });
}
