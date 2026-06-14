// GET /api/admin/engage/requests — Riders who requested rides (direct booking,
// blast, rider_seeking, down_bad). Powers the Engage console "Requests" tab:
// each row carries the rider's contact + pickup/dropoff/price/time so an admin
// can reach out. Mirrors /api/admin/ride-requests but also surfaces the
// structured blast pickup/dropoff and the kind (direct vs blast).
//
// Gated by act.engage (server enforcement also lives in app/admin/layout.tsx
// via route-permissions). We re-check here because API routes aren't behind
// that layout guard.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, hasPermission } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export interface EngageRequestRow {
  request_kind: 'direct' | 'blast' | 'broadcast';
  id: string;
  post_type: string;
  status: string;
  price: number | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  pickup_area_slug: string | null;
  dropoff_area_slug: string | null;
  scheduled_for: string | null;
  created_at: string;
  expires_at: string | null;
  // Rider (poster)
  user_id: string;
  rider_name: string | null;
  rider_handle: string | null;
  rider_phone: string | null;
  rider_admin_texted: boolean;
  rider_last_admin_sms_at: string | null;
  // Direct-booking target driver (NULL for broadcasts)
  target_driver_id: string | null;
  target_driver_name: string | null;
  target_driver_handle: string | null;
  target_driver_phone: string | null;
  // Driver who declined a direct booking (if any)
  declined_by_driver_id: string | null;
  declined_by_driver_name: string | null;
  declined_by_driver_handle: string | null;
  declined_by_driver_phone: string | null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.engage.view')) return unauthorizedResponse();

  const url = req.nextUrl;
  const statusParam = url.searchParams.get('status'); // active | expired | declined_awaiting_rider | matched | all
  const kindParam = url.searchParams.get('kind'); // direct | blast | broadcast | all
  const marketId = url.searchParams.get('marketId');
  const search = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 500);

  const allowedStatuses = new Set(['active', 'expired', 'declined_awaiting_rider', 'matched', 'cancelled', 'completed']);
  const filterStatus = statusParam && allowedStatuses.has(statusParam) ? statusParam : null;

  // kind maps to post_type buckets:
  //   direct    → direct_booking
  //   blast     → blast
  //   broadcast → rider_seeking_driver, down_bad
  const filterKind = (kindParam && ['direct', 'blast', 'broadcast'].includes(kindParam)) ? kindParam : null;
  const searchLike = search ? `%${search}%` : null;

  const rows = await sql`
    SELECT
      CASE
        WHEN p.post_type = 'direct_booking' THEN 'direct'
        WHEN p.post_type = 'blast' THEN 'blast'
        ELSE 'broadcast'
      END AS request_kind,
      p.id,
      p.post_type,
      p.status,
      p.price,
      p.pickup_address,
      p.dropoff_address,
      p.pickup_area_slug,
      p.dropoff_area_slug,
      p.scheduled_for,
      p.created_at,
      p.expires_at,
      u.id AS user_id,
      COALESCE(rp.display_name, rp.first_name) AS rider_name,
      rp.handle AS rider_handle,
      rp.phone AS rider_phone,
      EXISTS (SELECT 1 FROM admin_sms_sent s WHERE s.recipient_id = u.id) AS rider_admin_texted,
      (SELECT MAX(s.sent_at) FROM admin_sms_sent s WHERE s.recipient_id = u.id) AS rider_last_admin_sms_at,
      p.target_driver_id,
      COALESCE(tdp.display_name, tdp.first_name) AS target_driver_name,
      tdp.handle AS target_driver_handle,
      tdp.phone AS target_driver_phone,
      p.last_declined_by AS declined_by_driver_id,
      COALESCE(ldp.display_name, ldp.first_name) AS declined_by_driver_name,
      ldp.handle AS declined_by_driver_handle,
      ldp.phone AS declined_by_driver_phone
    FROM hmu_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    LEFT JOIN driver_profiles tdp ON tdp.user_id = p.target_driver_id
    LEFT JOIN driver_profiles ldp ON ldp.user_id = p.last_declined_by
    WHERE p.post_type IN ('direct_booking', 'blast', 'rider_seeking_driver', 'down_bad')
      AND (${filterStatus}::text IS NULL OR p.status = ${filterStatus})
      AND (
        ${filterKind}::text IS NULL
        OR (${filterKind} = 'direct' AND p.post_type = 'direct_booking')
        OR (${filterKind} = 'blast' AND p.post_type = 'blast')
        OR (${filterKind} = 'broadcast' AND p.post_type IN ('rider_seeking_driver', 'down_bad'))
      )
      AND (${marketId}::uuid IS NULL OR p.market_id = ${marketId})
      AND (
        ${searchLike}::text IS NULL
        OR rp.display_name ILIKE ${searchLike}
        OR rp.first_name ILIKE ${searchLike}
        OR rp.handle ILIKE ${searchLike}
        OR rp.phone ILIKE ${searchLike}
        OR p.pickup_address ILIKE ${searchLike}
        OR p.dropoff_address ILIKE ${searchLike}
      )
    ORDER BY
      CASE p.status WHEN 'active' THEN 1 WHEN 'declined_awaiting_rider' THEN 2 ELSE 3 END,
      p.created_at DESC
    LIMIT ${limit}
  `;

  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE post_type = 'direct_booking')::int AS direct,
      COUNT(*) FILTER (WHERE post_type = 'blast')::int AS blast,
      COUNT(*) FILTER (WHERE post_type IN ('rider_seeking_driver','down_bad'))::int AS broadcast,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*)::int AS total
    FROM hmu_posts
    WHERE post_type IN ('direct_booking', 'blast', 'rider_seeking_driver', 'down_bad')
      AND (${marketId}::uuid IS NULL OR market_id = ${marketId})
  `;

  return NextResponse.json({ rows: rows as EngageRequestRow[], stats: stats[0] });
}
