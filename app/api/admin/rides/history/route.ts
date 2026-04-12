// GET /api/admin/rides/history — All completed rides with pickup/dropoff coords for map overlay
import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rides = await sql`
    SELECT
      r.id, r.ref_code, r.status,
      r.pickup_lat, r.pickup_lng,
      r.dropoff_lat, r.dropoff_lng,
      COALESCE(r.final_agreed_price, r.amount) as price,
      r.created_at
    FROM rides r
    WHERE r.pickup_lat IS NOT NULL AND r.dropoff_lat IS NOT NULL
      AND r.status IN ('completed', 'ended', 'cancelled', 'disputed')
    ORDER BY r.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json({
    rides: rides.map((r: Record<string, unknown>) => ({
      id: r.id,
      refCode: r.ref_code,
      status: r.status,
      pickupLat: Number(r.pickup_lat),
      pickupLng: Number(r.pickup_lng),
      dropoffLat: Number(r.dropoff_lat),
      dropoffLng: Number(r.dropoff_lng),
      price: Number(r.price || 0),
      createdAt: r.created_at,
    })),
  });
}
