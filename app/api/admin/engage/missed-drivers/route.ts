// GET /api/admin/engage/missed-drivers — Drivers who missed a ride request.
// Two sources, unioned:
//   1. BLAST misses — driver was notified (blast_driver_targets.notified_at set)
//      but never HMU'd / passed / was selected / rejected, AND the blast is no
//      longer winnable for them (expired, matched to someone else, or cancelled).
//   2. DIRECT misses — a direct_booking's target driver let it expire, or
//      declined it (last_declined_by = target). No ride was ever created.
//
// Each row carries the driver's contact + the request they missed (pickup,
// dropoff, price, time) so an admin can text them "you missed a $25 ride".
// Gated by act.engage.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, hasPermission } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export interface MissedDriverRow {
  request_kind: 'blast' | 'direct';
  request_id: string;
  post_type: string;
  price: number | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  requested_at: string;
  notified_at: string | null;
  request_status: string;
  miss_reason: 'no_response' | 'expired' | 'declined';
  driver_id: string;
  driver_name: string | null;
  driver_handle: string | null;
  driver_phone: string | null;
  driver_admin_texted: boolean;
  driver_last_admin_sms_at: string | null;
  rider_name: string | null;
  rider_handle: string | null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.engage.view')) return unauthorizedResponse();

  const url = req.nextUrl;
  const marketId = url.searchParams.get('marketId');
  const reasonParam = url.searchParams.get('reason'); // no_response | expired | declined | all
  const filterReason = (reasonParam && ['no_response', 'expired', 'declined'].includes(reasonParam)) ? reasonParam : null;
  const search = (url.searchParams.get('q') || '').trim();
  const searchLike = search ? `%${search}%` : null;
  const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 500);

  const rows = await sql`
    WITH misses AS (
      -- 1. Blast misses: notified, no response, blast no longer winnable
      SELECT
        'blast'::text AS request_kind,
        p.id AS request_id,
        p.post_type,
        p.price,
        p.pickup_address,
        p.dropoff_address,
        p.created_at AS requested_at,
        bdt.notified_at,
        p.status AS request_status,
        'no_response'::text AS miss_reason,
        bdt.driver_id,
        p.user_id AS rider_user_id,
        p.market_id
      FROM blast_driver_targets bdt
      JOIN hmu_posts p ON p.id = bdt.blast_id
      WHERE bdt.notified_at IS NOT NULL
        AND bdt.hmu_at IS NULL
        AND bdt.passed_at IS NULL
        AND bdt.selected_at IS NULL
        AND bdt.rejected_at IS NULL
        AND (p.status <> 'active' OR (p.expires_at IS NOT NULL AND p.expires_at < NOW()))

      UNION ALL

      -- 2. Direct misses: target driver let it expire or declined it
      SELECT
        'direct'::text AS request_kind,
        p.id AS request_id,
        p.post_type,
        p.price,
        p.pickup_address,
        p.dropoff_address,
        p.created_at AS requested_at,
        NULL::timestamptz AS notified_at,
        p.status AS request_status,
        CASE WHEN p.last_declined_by = p.target_driver_id THEN 'declined'::text ELSE 'expired'::text END AS miss_reason,
        p.target_driver_id AS driver_id,
        p.user_id AS rider_user_id,
        p.market_id
      FROM hmu_posts p
      WHERE p.post_type = 'direct_booking'
        AND p.target_driver_id IS NOT NULL
        AND (
          p.status = 'expired'
          OR (p.status = 'declined_awaiting_rider' AND p.last_declined_by = p.target_driver_id)
        )
        AND NOT EXISTS (SELECT 1 FROM rides r WHERE r.hmu_post_id = p.id)
    )
    SELECT
      m.request_kind,
      m.request_id,
      m.post_type,
      m.price,
      m.pickup_address,
      m.dropoff_address,
      m.requested_at,
      m.notified_at,
      m.request_status,
      m.miss_reason,
      m.driver_id,
      COALESCE(dp.display_name, dp.first_name) AS driver_name,
      dp.handle AS driver_handle,
      dp.phone AS driver_phone,
      EXISTS (SELECT 1 FROM admin_sms_sent s WHERE s.recipient_id = m.driver_id) AS driver_admin_texted,
      (SELECT MAX(s.sent_at) FROM admin_sms_sent s WHERE s.recipient_id = m.driver_id) AS driver_last_admin_sms_at,
      COALESCE(rp.display_name, rp.first_name) AS rider_name,
      rp.handle AS rider_handle
    FROM misses m
    JOIN driver_profiles dp ON dp.user_id = m.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = m.rider_user_id
    WHERE (${marketId}::uuid IS NULL OR m.market_id = ${marketId})
      AND (${filterReason}::text IS NULL OR m.miss_reason = ${filterReason})
      AND (
        ${searchLike}::text IS NULL
        OR dp.display_name ILIKE ${searchLike}
        OR dp.first_name ILIKE ${searchLike}
        OR dp.handle ILIKE ${searchLike}
        OR dp.phone ILIKE ${searchLike}
      )
    ORDER BY m.requested_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json({ rows: rows as MissedDriverRow[] });
}
