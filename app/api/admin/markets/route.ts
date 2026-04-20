import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const markets = await sql`
    SELECT
      m.id, m.slug, m.name, m.subdomain, m.state, m.timezone, m.status,
      m.center_lat, m.center_lng, m.radius_miles,
      m.launch_date, m.sms_did, m.sms_area_code,
      m.fee_config, m.launch_offer_config, m.branding,
      m.min_drivers_to_launch,
      (SELECT COUNT(*) FROM users WHERE market_id = m.id AND profile_type = 'driver')::int as driver_count,
      (SELECT COUNT(*) FROM users WHERE market_id = m.id AND profile_type = 'rider')::int as rider_count,
      (SELECT COUNT(*) FROM rides WHERE market_id = m.id AND status IN ('ended', 'completed'))::int as completed_rides,
      (SELECT COUNT(*) FROM market_areas WHERE market_id = m.id AND is_active = true)::int as area_count
    FROM markets m
    ORDER BY m.status = 'live' DESC, m.name ASC
  `;

  return NextResponse.json({
    markets: markets.map((m: Record<string, unknown>) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      subdomain: m.subdomain,
      state: m.state,
      timezone: m.timezone,
      status: m.status,
      launchDate: m.launch_date,
      smsDid: m.sms_did,
      driverCount: Number(m.driver_count || 0),
      riderCount: Number(m.rider_count || 0),
      completedRides: Number(m.completed_rides || 0),
      areaCount: Number(m.area_count || 0),
      minDriversToLaunch: Number(m.min_drivers_to_launch || 10),
      centerLat: m.center_lat === null || m.center_lat === undefined ? null : Number(m.center_lat),
      centerLng: m.center_lng === null || m.center_lng === undefined ? null : Number(m.center_lng),
    })),
  });
}
