// POST /api/partner/v1/bookings/{id}/complete
// Vendor signals the delivery is done → HMU captures the held delivery fee
// (pays the driver) and marks the booking + ride completed. {id} is the
// booking_id from create. Requires bookings:write. Idempotent.

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/partner/auth';
import { completePartnerBooking } from '@/lib/partner/booking-complete';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Body is optional/empty; sign over the empty string for an empty body.
  const rawBody = await req.text();
  const auth = await authenticatePartner(req, rawBody, 'bookings:write');
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const result = await completePartnerBooking(auth.ctx.partner.id, id);

  if (result.ok) {
    return NextResponse.json({
      booking_id: id,
      status: 'completed',
      already_complete: result.alreadyComplete,
      driver_payout_cents: result.driverPayoutCents,
      platform_fee_cents: result.platformFeeCents,
    });
  }
  return NextResponse.json({ error: result.error, message: result.message }, { status: result.httpStatus });
}
