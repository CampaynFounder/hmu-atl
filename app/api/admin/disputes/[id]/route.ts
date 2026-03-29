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

  const rows = await sql`
    SELECT
      d.id, d.ride_id, d.filed_by, d.reason, d.status,
      d.ably_history_url, d.created_at as dispute_created_at,
      r.status as ride_status, COALESCE(r.final_agreed_price, r.amount) as amount,
      COALESCE(r.platform_fee_amount, 0) as platform_fee,
      COALESCE(r.stripe_fee_amount, 0) as stripe_fee,
      COALESCE(r.driver_payout_amount, 0) as driver_payout,
      COALESCE(r.waived_fee_amount, 0) as waived_fee,
      r.pickup, r.dropoff, r.stops, r.payment_intent_id,
      r.pickup_address, r.pickup_lat, r.pickup_lng,
      r.dropoff_address, r.dropoff_lat, r.dropoff_lng,
      r.here_verified, r.here_proximity_ft,
      r.end_verified, r.end_proximity_ft,
      r.driver_here_lat, r.driver_here_lng,
      r.driver_end_lat, r.driver_end_lng,
      r.created_at as ride_created_at, r.updated_at as ride_updated_at,
      r.otw_at, r.here_at, r.coo_at, r.started_at, r.ended_at, r.completed_at,
      r.driver_id, r.rider_id,
      COALESCE(dp.display_name, dp.first_name) as driver_name, dp.handle as driver_handle,
      COALESCE(rp.display_name, rp.first_name) as rider_name,
      u_driver.chill_score as driver_chill, COALESCE(u_driver.completed_rides, 0) as driver_rides,
        (SELECT COUNT(*) FROM disputes WHERE filed_by = u_driver.id) as driver_disputes, u_driver.tier as driver_tier,
      u_rider.chill_score as rider_chill, COALESCE(u_rider.completed_rides, 0) as rider_rides,
        (SELECT COUNT(*) FROM disputes WHERE filed_by = u_rider.id) as rider_disputes, u_rider.og_status as rider_og
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

  const gpsTrail = await sql`
    SELECT lat, lng, recorded_at
    FROM ride_locations
    WHERE ride_id = ${d.ride_id}
    ORDER BY recorded_at ASC
  `;

  const ratings = await sql`
    SELECT rating_type, rater_id, rated_id, created_at
    FROM ratings
    WHERE ride_id = ${d.ride_id}
    ORDER BY created_at ASC
  `;

  const flags = [];

  const filerDisputeCount = await sql`
    SELECT COUNT(*) as cnt FROM disputes WHERE filed_by = ${d.filed_by}
  `;
  if (Number(filerDisputeCount[0]?.cnt ?? 0) >= 3) {
    flags.push({ type: 'pattern', message: 'Filer has 3+ disputes — pattern flag' });
  }

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
      ablyHistoryUrl: d.ably_history_url,
      createdAt: d.dispute_created_at,
    },
    ride: {
      status: d.ride_status,
      price: Number(d.amount ?? 0),
      platformFee: Number(d.platform_fee ?? 0),
      stripeFee: Number(d.stripe_fee ?? 0),
      driverPayout: Number(d.driver_payout ?? 0),
      waivedFee: Number(d.waived_fee ?? 0),
      pickup: d.pickup,
      dropoff: d.dropoff,
      stops: d.stops,
      pickupAddress: d.pickup_address,
      pickupLat: d.pickup_lat ? Number(d.pickup_lat) : null,
      pickupLng: d.pickup_lng ? Number(d.pickup_lng) : null,
      dropoffAddress: d.dropoff_address,
      dropoffLat: d.dropoff_lat ? Number(d.dropoff_lat) : null,
      dropoffLng: d.dropoff_lng ? Number(d.dropoff_lng) : null,
      paymentIntentId: d.payment_intent_id,
      createdAt: d.ride_created_at,
      updatedAt: d.ride_updated_at,
      otwAt: d.otw_at,
      hereAt: d.here_at,
      cooAt: d.coo_at,
      startedAt: d.started_at,
      endedAt: d.ended_at,
      completedAt: d.completed_at,
    },
    geoVerification: {
      hereVerified: d.here_verified ?? null,
      hereProximityFt: d.here_proximity_ft ? Number(d.here_proximity_ft) : null,
      driverHereLat: d.driver_here_lat ? Number(d.driver_here_lat) : null,
      driverHereLng: d.driver_here_lng ? Number(d.driver_here_lng) : null,
      endVerified: d.end_verified ?? null,
      endProximityFt: d.end_proximity_ft ? Number(d.end_proximity_ft) : null,
      driverEndLat: d.driver_end_lat ? Number(d.driver_end_lat) : null,
      driverEndLng: d.driver_end_lng ? Number(d.driver_end_lng) : null,
      stopsCompleted: Array.isArray(d.stops) ? (d.stops as Record<string, unknown>[]).filter(s => s.verified).length : 0,
      stopsTotal: Array.isArray(d.stops) ? (d.stops as Record<string, unknown>[]).length : 0,
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
