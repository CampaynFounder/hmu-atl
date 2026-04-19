// GET /api/admin/ride-requests — lists HMU posts that never got a rider matched,
// optional rides that are stuck in pending. Used by /admin/ride-requests for
// outreach ("Hey I saw you were looking for a ride, still need one?").

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export interface RideRequestRow {
  source: 'hmu_post' | 'ride';
  id: string;
  post_type: string;
  status: string;
  areas: string[] | null;
  pickup_area_slug: string | null;
  dropoff_area_slug: string | null;
  price: number | null;
  time_window: Record<string, unknown> | null;
  created_at: string;
  expires_at: string | null;
  user_id: string;
  profile_type: string;
  signup_source: string | null;
  name: string | null;
  phone: string | null;
  admin_texted: boolean;
  last_admin_sms_at: string | null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const url = req.nextUrl;
  const statusParam = url.searchParams.get('status'); // 'active' | 'expired' | 'declined_awaiting_rider' | 'all'
  const typeParam = url.searchParams.get('post_type'); // 'rider_seeking_driver' | 'driver_offering_ride' | 'direct_booking' | 'all'
  const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 500);

  const allowedStatuses = new Set(['active', 'expired', 'declined_awaiting_rider']);
  const filterStatus = statusParam && allowedStatuses.has(statusParam) ? statusParam : null;
  const filterType = (typeParam && ['rider_seeking_driver', 'driver_offering_ride', 'direct_booking'].includes(typeParam))
    ? typeParam
    : null;

  // Build query with optional filters. We use parameterized CASE-like filtering
  // in SQL to keep the query single-shot. When filterStatus is null, match any
  // of the three allowed statuses.
  const rows = await sql`
    SELECT
      'hmu_post'::text AS source,
      p.id,
      p.post_type,
      p.status,
      p.areas,
      p.pickup_area_slug,
      p.dropoff_area_slug,
      p.price,
      p.time_window,
      p.created_at,
      p.expires_at,
      u.id AS user_id,
      u.profile_type,
      u.signup_source,
      COALESCE(rp.display_name, rp.first_name, dp.display_name, dp.first_name) AS name,
      COALESCE(rp.phone, dp.phone) AS phone,
      EXISTS (SELECT 1 FROM admin_sms_sent s WHERE s.recipient_id = u.id) AS admin_texted,
      (SELECT MAX(s.sent_at) FROM admin_sms_sent s WHERE s.recipient_id = u.id) AS last_admin_sms_at
    FROM hmu_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE p.status IN ('active','expired','declined_awaiting_rider')
      AND (${filterStatus}::text IS NULL OR p.status = ${filterStatus})
      AND (${filterType}::text IS NULL OR p.post_type = ${filterType})
    ORDER BY
      CASE p.status WHEN 'active' THEN 1 WHEN 'declined_awaiting_rider' THEN 2 ELSE 3 END,
      p.created_at DESC
    LIMIT ${limit}
  `;

  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
      COUNT(*) FILTER (WHERE status = 'declined_awaiting_rider')::int AS declined,
      COUNT(*) FILTER (WHERE post_type = 'rider_seeking_driver')::int AS rider_seeking,
      COUNT(*) FILTER (WHERE post_type = 'driver_offering_ride')::int AS driver_offering,
      COUNT(*) FILTER (WHERE post_type = 'direct_booking')::int AS direct_booking
    FROM hmu_posts
    WHERE status IN ('active','expired','declined_awaiting_rider')
  `;

  return NextResponse.json({ rows: rows as RideRequestRow[], stats: stats[0] });
}
