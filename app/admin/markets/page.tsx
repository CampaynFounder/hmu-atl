import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import MarketsClient, { type AdminMarket } from './markets-client';

export const dynamic = 'force-dynamic';

export default async function AdminMarketsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');

  const rows = await sql`
    SELECT
      m.id, m.slug, m.name, m.subdomain, m.state, m.timezone, m.status,
      m.launch_date, m.sms_did, m.sms_area_code,
      m.center_lat::float8 as center_lat, m.center_lng::float8 as center_lng,
      m.radius_miles, m.min_drivers_to_launch,
      (SELECT COUNT(*) FROM users WHERE market_id = m.id AND profile_type = 'driver')::int as driver_count,
      (SELECT COUNT(*) FROM users WHERE market_id = m.id AND profile_type = 'rider')::int as rider_count,
      (SELECT COUNT(*) FROM rides WHERE market_id = m.id AND status IN ('ended', 'completed'))::int as completed_rides,
      (SELECT COUNT(*) FROM market_areas WHERE market_id = m.id AND is_active = true)::int as area_count
    FROM markets m
    ORDER BY m.status = 'live' DESC, m.name ASC
  `;

  const markets: AdminMarket[] = rows.map((m: Record<string, unknown>) => ({
    id: m.id as string,
    slug: m.slug as string,
    name: m.name as string,
    subdomain: (m.subdomain as string) || null,
    state: (m.state as string) || null,
    timezone: (m.timezone as string) || null,
    status: m.status as AdminMarket['status'],
    launchDate: m.launch_date ? String(m.launch_date) : null,
    smsDid: (m.sms_did as string) || null,
    smsAreaCode: (m.sms_area_code as string) || null,
    centerLat: m.center_lat === null ? null : Number(m.center_lat),
    centerLng: m.center_lng === null ? null : Number(m.center_lng),
    radiusMiles: m.radius_miles === null ? null : Number(m.radius_miles),
    driverCount: Number(m.driver_count || 0),
    riderCount: Number(m.rider_count || 0),
    completedRides: Number(m.completed_rides || 0),
    areaCount: Number(m.area_count || 0),
    minDriversToLaunch: Number(m.min_drivers_to_launch || 10),
  }));

  return <MarketsClient initialMarkets={markets} />;
}
