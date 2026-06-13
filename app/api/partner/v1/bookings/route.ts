// POST /api/partner/v1/bookings — create a vendor_funded delivery booking.
//
// Auth: API key + HMAC (bookings:write). Honors an Idempotency-Key header so a
// retried create replays the original response instead of double-booking.
// No charge happens here — the delivery-fee hold is placed when the driver
// accepts (lib/partner/booking-hold.ts).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { authenticatePartner } from '@/lib/partner/auth';
import { createPartnerDeliveryBooking, type BookingInput } from '@/lib/partner/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const auth = await authenticatePartner(req, rawBody, 'bookings:write');
  if (!auth.ok) return auth.res;
  const ctx = auth.ctx;

  const idemKey = req.headers.get('idempotency-key')?.trim() || '';

  // Replay a prior response for the same idempotency key.
  if (idemKey) {
    const prior = await sql`
      SELECT response_status, response_body
      FROM api_idempotency
      WHERE partner_id = ${ctx.partner.id} AND idem_key = ${idemKey}
      LIMIT 1
    `;
    if (prior[0]) {
      const r = prior[0] as { response_status: number; response_body: unknown };
      return NextResponse.json(r.response_body, { status: r.response_status });
    }
  }

  let body: BookingInput;
  try {
    body = rawBody ? (JSON.parse(rawBody) as BookingInput) : {};
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 });
  }

  let status: number;
  let payload: Record<string, unknown>;
  try {
    const result = await createPartnerDeliveryBooking(ctx, body);
    if (result.ok) {
      status = 201;
      payload = {
        booking_id: result.bookingId,
        status: result.status,
        expires_at: result.expiresAt,
        fee_split: result.feeSplit,
      };
    } else {
      status = result.httpStatus;
      payload = { error: result.error, message: result.message };
    }
  } catch (e) {
    console.error('[partner/v1/bookings] create failed', e);
    return NextResponse.json(
      { error: 'internal_error', message: 'Could not create booking' },
      { status: 500 },
    );
  }

  // Persist the outcome for idempotent replay — but never cache 5xx (transient).
  if (idemKey && status < 500) {
    await sql`
      INSERT INTO api_idempotency (partner_id, idem_key, response_status, response_body)
      VALUES (${ctx.partner.id}, ${idemKey}, ${status}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (partner_id, idem_key) DO NOTHING
    `.catch(() => {});
  }

  return NextResponse.json(payload, { status });
}
