import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

async function requireAdmin(clerkId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT profile_type, is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `) as Array<{ profile_type: string; is_admin: boolean | null }>;
  const u = rows[0];
  return !!u && (u.profile_type === 'admin' || u.is_admin === true);
}

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await requireAdmin(clerkId))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') ?? 'open'; // 'open' | 'recent'
  const limit = Math.min(100, Number(url.searchParams.get('limit') ?? '50'));

  const rows = (scope === 'recent'
    ? await sql`
        SELECT
          e.id, e.ride_id, e.event_type, e.severity, e.party,
          e.detected_at, e.location_lat, e.location_lng, e.evidence,
          e.admin_resolved_at, e.admin_resolved_by, e.admin_notes,
          r.status AS ride_status,
          rider.id AS rider_id,
          driver.id AS driver_id,
          rp.display_name AS rider_name, rp.phone AS rider_phone,
          dp.display_name AS driver_name, dp.phone AS driver_phone
        FROM ride_safety_events e
        INNER JOIN rides r ON r.id = e.ride_id
        LEFT JOIN users rider ON rider.id = r.rider_id
        LEFT JOIN users driver ON driver.id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = rider.id
        LEFT JOIN driver_profiles dp ON dp.user_id = driver.id
        ORDER BY e.detected_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          e.id, e.ride_id, e.event_type, e.severity, e.party,
          e.detected_at, e.location_lat, e.location_lng, e.evidence,
          e.admin_resolved_at, e.admin_resolved_by, e.admin_notes,
          r.status AS ride_status,
          rider.id AS rider_id,
          driver.id AS driver_id,
          rp.display_name AS rider_name, rp.phone AS rider_phone,
          dp.display_name AS driver_name, dp.phone AS driver_phone
        FROM ride_safety_events e
        INNER JOIN rides r ON r.id = e.ride_id
        LEFT JOIN users rider ON rider.id = r.rider_id
        LEFT JOIN users driver ON driver.id = r.driver_id
        LEFT JOIN rider_profiles rp ON rp.user_id = rider.id
        LEFT JOIN driver_profiles dp ON dp.user_id = driver.id
        WHERE e.admin_resolved_at IS NULL
        ORDER BY
          CASE e.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warn' THEN 3 ELSE 4 END,
          e.detected_at DESC
        LIMIT ${limit}
      `) as Array<Record<string, unknown>>;

  // Also return the set of ride_ids with *any* open event — the live map
  // consumes this to decorate markers with a pulse ring.
  const openRideIds = (await sql`
    SELECT DISTINCT ride_id FROM ride_safety_events
    WHERE admin_resolved_at IS NULL
  `) as Array<{ ride_id: string }>;

  return NextResponse.json({
    events: rows,
    openRideIds: openRideIds.map((r) => r.ride_id),
  });
}
