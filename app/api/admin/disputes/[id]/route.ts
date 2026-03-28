// GET /api/admin/disputes/[id] — Dispute detail with full ride timeline
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

  // Get dispute + ride + users
  const rows = await sql`
    SELECT
      d.id, d.ride_id, d.filed_by, d.details as reason, d.status,
      d.admin_notes, d.ably_history_url, d.created_at as dispute_created_at,
      r.status as ride_status, r.price, r.application_fee, r.pickup, r.dropoff,
      r.stops, r.payment_intent_id, r.created_at as ride_created_at,
      r.updated_at as ride_updated_at,
      r.driver_id, r.rider_id,
      dp.first_name as driver_name, dp.handle as driver_handle,
      rp.first_name as rider_name,
      u_driver.chill_score as driver_chill, u_driver.completed_rides as driver_rides,
        u_driver.dispute_count as driver_disputes, u_driver.tier as driver_tier,
      u_rider.chill_score as rider_chill, u_rider.completed_rides as rider_rides,
        u_rider.dispute_count as rider_disputes, u_rider.og_status as rider_og
    FROM disputes d
    JOIN rides r ON r.id = d.ride_id
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
    LEFT JOIN users u_driver ON u_driver.id = r.driver_id
    LEFT JOIN users u_rider ON u_rider.id = r.rider_id
    WHERE d.id = ${id}
    LIMIT 1
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const d = rows[0];

  // Get GPS trail for the ride
  const gpsTrail = await sql`
    SELECT lat, lng, recorded_at
    FROM ride_locations
    WHERE ride_id = ${d.ride_id}
    ORDER BY recorded_at ASC
  `;

  // Get ratings between these two users
  const ratings = await sql`
    SELECT rating_type, rater_id, rated_id, created_at
    FROM ratings
    WHERE ride_id = ${d.ride_id}
    ORDER BY created_at ASC
  `;

  // Check auto-flags
  const flags = [];

  // Pattern flag: 3+ disputes from filer
  const filerDisputeCount = await sql`
    SELECT COUNT(*) as cnt FROM disputes WHERE filed_by = ${d.filed_by}
  `;
  if (Number(filerDisputeCount[0]?.cnt ?? 0) >= 3) {
    flags.push({ type: 'pattern', message: 'Filer has 3+ disputes — pattern flag' });
  }

  // Mutual WEIRDO check
  const mutualWeirdo = await sql`
    SELECT COUNT(*) as cnt FROM ratings
    WHERE ride_id = ${d.ride_id} AND rating_type = 'weirdo'
  `;
  if (Number(mutualWeirdo[0]?.cnt ?? 0) >= 2) {
    flags.push({ type: 'retaliation', message: 'Mutual WEIRDO ratings — retaliation flag' });
  }

  return NextResponse.json({
    dispute: {
      id: d.id,
      rideId: d.ride_id,
      filedBy: d.filed_by,
      reason: d.reason,
      status: d.status,
      adminNotes: d.admin_notes,
      ablyHistoryUrl: d.ably_history_url,
      createdAt: d.dispute_created_at,
    },
    ride: {
      status: d.ride_status,
      price: Number(d.price ?? 0),
      applicationFee: Number(d.application_fee ?? 0),
      pickup: d.pickup,
      dropoff: d.dropoff,
      stops: d.stops,
      paymentIntentId: d.payment_intent_id,
      createdAt: d.ride_created_at,
      updatedAt: d.ride_updated_at,
    },
    driver: {
      id: d.driver_id,
      name: d.driver_name,
      handle: d.driver_handle,
      chillScore: Number(d.driver_chill ?? 0),
      completedRides: Number(d.driver_rides ?? 0),
      disputeCount: Number(d.driver_disputes ?? 0),
      tier: d.driver_tier,
    },
    rider: {
      id: d.rider_id,
      name: d.rider_name,
      chillScore: Number(d.rider_chill ?? 0),
      completedRides: Number(d.rider_rides ?? 0),
      disputeCount: Number(d.rider_disputes ?? 0),
      ogStatus: d.rider_og,
    },
    gpsTrail: gpsTrail.map((g: Record<string, unknown>) => ({
      lat: Number(g.lat),
      lng: Number(g.lng),
      recordedAt: g.recorded_at,
    })),
    ratings: ratings.map((r: Record<string, unknown>) => ({
      type: r.rating_type,
      raterId: r.rater_id,
      ratedId: r.rated_id,
      createdAt: r.created_at,
    })),
    flags,
  });
}
