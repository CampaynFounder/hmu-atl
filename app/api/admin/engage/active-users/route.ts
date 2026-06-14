// GET /api/admin/engage/active-users — Riders & drivers who logged in recently.
// Source of truth is users.last_sign_in_at (written by the Clerk session.created
// webhook; see app/api/webhooks/clerk/route.ts). Powers the Engage console
// "Active" tab so an admin can reach out to people who are actually online.
//
// ?range=today|week  (default today)  ?type=rider|driver|all (default all)
// Gated by act.engage.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, hasPermission } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export interface ActiveUserRow {
  id: string;
  profile_type: string;
  name: string | null;
  handle: string | null;
  phone: string | null;
  last_sign_in_at: string | null;
  sign_in_count: number | null;
  admin_texted: boolean;
  last_admin_sms_at: string | null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.engage.view')) return unauthorizedResponse();

  const url = req.nextUrl;
  const range = url.searchParams.get('range') === 'week' ? 'week' : 'today';
  const typeParam = url.searchParams.get('type');
  const filterType = (typeParam && ['rider', 'driver'].includes(typeParam)) ? typeParam : null;
  const marketId = url.searchParams.get('marketId');
  const search = (url.searchParams.get('q') || '').trim();
  const searchLike = search ? `%${search}%` : null;
  const limit = Math.min(Number(url.searchParams.get('limit') || '300'), 1000);

  // Window is computed as a boolean predicate the query toggles on. 'today' =
  // since local midnight (server tz); 'week' = trailing 7 days.
  const isWeek = range === 'week';

  const rows = await sql`
    SELECT
      u.id,
      u.profile_type,
      COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS name,
      COALESCE(dp.handle, rp.handle) AS handle,
      COALESCE(dp.phone, rp.phone, u.phone) AS phone,
      u.last_sign_in_at,
      u.sign_in_count,
      EXISTS (SELECT 1 FROM admin_sms_sent s WHERE s.recipient_id = u.id) AS admin_texted,
      (SELECT MAX(s.sent_at) FROM admin_sms_sent s WHERE s.recipient_id = u.id) AS last_admin_sms_at
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.profile_type IN ('rider', 'driver')
      AND u.last_sign_in_at IS NOT NULL
      AND (
        (${isWeek} AND u.last_sign_in_at >= CURRENT_DATE - INTERVAL '7 days')
        OR (NOT ${isWeek} AND u.last_sign_in_at >= CURRENT_DATE)
      )
      AND (${filterType}::text IS NULL OR u.profile_type = ${filterType})
      AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
      AND (
        ${searchLike}::text IS NULL
        OR dp.display_name ILIKE ${searchLike}
        OR rp.display_name ILIKE ${searchLike}
        OR dp.handle ILIKE ${searchLike}
        OR rp.handle ILIKE ${searchLike}
        OR dp.phone ILIKE ${searchLike}
        OR rp.phone ILIKE ${searchLike}
      )
    ORDER BY u.last_sign_in_at DESC
    LIMIT ${limit}
  `;

  // Counts for the tab header — today vs week, split by type. Single pass.
  const stats = await sql`
    SELECT
      COUNT(*) FILTER (WHERE last_sign_in_at >= CURRENT_DATE AND profile_type = 'rider')::int AS today_riders,
      COUNT(*) FILTER (WHERE last_sign_in_at >= CURRENT_DATE AND profile_type = 'driver')::int AS today_drivers,
      COUNT(*) FILTER (WHERE last_sign_in_at >= CURRENT_DATE - INTERVAL '7 days' AND profile_type = 'rider')::int AS week_riders,
      COUNT(*) FILTER (WHERE last_sign_in_at >= CURRENT_DATE - INTERVAL '7 days' AND profile_type = 'driver')::int AS week_drivers
    FROM users
    WHERE profile_type IN ('rider', 'driver')
      AND last_sign_in_at IS NOT NULL
      AND (${marketId}::uuid IS NULL OR market_id = ${marketId})
  `;

  return NextResponse.json({ rows: rows as ActiveUserRow[], stats: stats[0] });
}
