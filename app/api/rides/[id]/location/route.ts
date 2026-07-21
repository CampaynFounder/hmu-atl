import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, publishAdminEvent } from '@/lib/ably/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { lat, lng } = await req.json();

    if (!lat || !lng) {
      return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Verify user is part of this ride and the ride is in a trackable phase.
    // 'matched' is accepted ONLY once the rider has pulled up (coo_at set) —
    // the "inbound" stage — so the driver's position reaches the rider from
    // Pull Up onward, not just after the driver taps OTW. Pre-COO matched
    // rides still reject (no live tracking before the rider commits).
    // See lib/rides/stage-contract.ts → 'inbound'.
    const rideRows = await sql`
      SELECT status, driver_id, pickup_lat, pickup_lng FROM rides
      WHERE id = ${rideId} AND (driver_id = ${userId} OR rider_id = ${userId})
      AND (
        status IN ('otw', 'here', 'confirming', 'active')
        OR (status = 'matched' AND coo_at IS NOT NULL)
      )
      LIMIT 1
    `;
    if (!rideRows.length) {
      return NextResponse.json({ error: 'No active ride found' }, { status: 404 });
    }

    await sql`
      INSERT INTO ride_locations (ride_id, user_id, lat, lng)
      VALUES (${rideId}, ${userId}, ${lat}, ${lng})
    `;

    // Publish location to ride channel for real-time map
    const ts = Date.now();
    await publishRideUpdate(rideId, 'location', { userId, lat, lng, timestamp: ts }).catch(() => {});
    // Also publish to admin feed for live ops map
    await publishAdminEvent('driver_location', { rideId, lat, lng, timestamp: ts }).catch(() => {});

    // No-show protection: the FIRST time the driver's live GPS is verified
    // within pickup proximity (~300ft) while inbound, stamp driver_arrived_at.
    // This is geofence-truth arrival, independent of whether the driver ever
    // taps HERE (a no-showing driver won't). Best-effort — never blocks the
    // location write, and only sets the column when it's still NULL, so it
    // records the earliest arrival and can't be re-armed. Fixed 300ft matches
    // the stop-tracking threshold below and the no_show config default, keeping
    // this hot (~15s) path free of an extra config read.
    const ride0 = rideRows[0] as Record<string, unknown>;
    const rideStatus = ride0.status;
    if (
      ride0.driver_id === userId &&
      (rideStatus === 'otw' || rideStatus === 'here') &&
      ride0.pickup_lat != null && ride0.pickup_lng != null
    ) {
      try {
        const R = 3958.8;
        const pLat = Number(ride0.pickup_lat);
        const pLng = Number(ride0.pickup_lng);
        const dLat = (pLat - lat) * Math.PI / 180;
        const dLon = (pLng - lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(pLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        const distFt = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 5280;
        if (distFt <= 300) {
          await sql`
            UPDATE rides SET driver_arrived_at = NOW()
            WHERE id = ${rideId} AND driver_arrived_at IS NULL
          `;
        }
      } catch (e) {
        console.error('[no-show] driver_arrived_at stamp skipped:', e);
      }
    }

    // Background stop tracking — auto-mark stops as reached when within ~300ft
    if (rideStatus === 'active') {
      try {
        const stopsRows = await sql`SELECT stops FROM rides WHERE id = ${rideId} LIMIT 1`;
        const stops = stopsRows.length ? (stopsRows[0] as Record<string, unknown>).stops as Record<string, unknown>[] | null : null;
        if (stops && Array.isArray(stops)) {
          let updated = false;
          const THRESHOLD_FT = 300;
          for (const stop of stops) {
            if (stop.reached_at) continue; // already reached
            const sLat = Number(stop.latitude);
            const sLng = Number(stop.longitude);
            if (!sLat || !sLng) continue;
            // Haversine distance in feet
            const R = 3958.8; // Earth radius in miles
            const dLat = (sLat - lat) * Math.PI / 180;
            const dLon = (sLng - lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(sLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
            const distFt = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 5280;
            if (distFt <= THRESHOLD_FT) {
              stop.reached_at = new Date().toISOString();
              stop.verified = true;
              updated = true;
            }
          }
          if (updated) {
            await sql`UPDATE rides SET stops = ${JSON.stringify(stops)}::jsonb, updated_at = NOW() WHERE id = ${rideId}`;
            await publishRideUpdate(rideId, 'stops_updated', { stops }).catch(() => {});
          }
        }
      } catch (e) {
        console.error('Stop tracking error:', e);
      }
    }

    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('Location error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
