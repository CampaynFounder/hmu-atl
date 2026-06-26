// GET /api/admin/rides/[id] — Full ride detail for the mobile Super Admin drill-down.
// Read-only: surfaces driver, rider, amount paid + fee breakdown, pickup/dropoff,
// booking type, payment method, status and the lifecycle timestamps so a superadmin
// can assess the health of any single ride. Mirrors the auth + query patterns in
// app/api/admin/rides/active/route.ts (driver/rider profile joins, fare COALESCE).
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;

  const rows = await sql`
    SELECT
      r.id, r.ref_code, r.status, r.booking_type, r.is_cash, r.market_id,
      COALESCE(r.final_agreed_price, r.amount) AS fare,
      r.amount, r.final_agreed_price,
      r.platform_fee_cents, r.driver_amount_cents,
      r.deposit_amount, r.visible_deposit,
      r.stripe_payment_intent_id,
      r.pickup_address, r.dropoff_address,
      r.pickup_lat, r.pickup_lng, r.dropoff_lat, r.dropoff_lng,
      r.stops,
      r.created_at, r.updated_at, r.otw_at, r.here_at, r.started_at,
      r.driver_id, r.rider_id,
      COALESCE(dp.display_name, dp.first_name) AS driver_name, dp.handle AS driver_handle, ud.phone AS driver_phone,
      COALESCE(rp.display_name, rp.first_name) AS rider_name, rp.handle AS rider_handle, ur.phone AS rider_phone
    FROM rides r
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    LEFT JOIN rider_profiles  rp ON rp.user_id = r.rider_id
    LEFT JOIN users ud ON ud.id = r.driver_id
    LEFT JOIN users ur ON ur.id = r.rider_id
    WHERE r.id = ${id}
    LIMIT 1
  `;

  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });

  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  const cents = (v: unknown): number | null => (v == null ? null : Number(v) / 100);

  return NextResponse.json({
    ride: {
      id: r.id,
      refCode: r.ref_code ?? null,
      status: r.status,
      bookingType: r.booking_type ?? 'standard',     // 'standard' | 'down_bad'
      paymentMethod: r.is_cash ? 'cash' : 'card',
      marketId: r.market_id ?? null,

      // Money
      fare: num(r.fare),                              // amount paid by rider (COALESCE agreed → amount)
      platformFee: cents(r.platform_fee_cents),       // HMU cut
      driverPayout: cents(r.driver_amount_cents),     // driver take-home
      deposit: num(r.deposit_amount),
      visibleDeposit: num(r.visible_deposit),
      stripePaymentIntentId: r.stripe_payment_intent_id ?? null,

      // Parties
      driver: {
        id: r.driver_id ?? null,
        name: r.driver_name ?? null,
        handle: r.driver_handle ?? null,
        phone: r.driver_phone ?? null,
      },
      rider: {
        id: r.rider_id ?? null,
        name: r.rider_name ?? null,
        handle: r.rider_handle ?? null,
        phone: r.rider_phone ?? null,
      },

      // Route
      pickupAddress: r.pickup_address ?? null,
      dropoffAddress: r.dropoff_address ?? null,
      pickupLat: num(r.pickup_lat),
      pickupLng: num(r.pickup_lng),
      dropoffLat: num(r.dropoff_lat),
      dropoffLng: num(r.dropoff_lng),
      stops: Array.isArray(r.stops) ? r.stops : null,

      // Lifecycle
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      otwAt: r.otw_at ?? null,
      hereAt: r.here_at ?? null,
      startedAt: r.started_at ?? null,
    },
  });
}
