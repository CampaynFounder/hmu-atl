// GET /api/admin/hmus?marketId=<uuid> — recent HMUs + per-driver send counts.
// DELETE /api/admin/hmus/[id] — revoke a specific HMU (handled in the [id] route).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');

  // Recent HMUs. Market filter is optional so admins can inspect cross-market
  // if a user question spans multiple markets.
  const recent = await sql`
    SELECT h.id, h.status, h.message, h.created_at, h.linked_at, h.dismissed_at,
           h.driver_id, h.rider_id, h.market_id,
           dp.handle AS driver_handle, dp.display_name AS driver_name,
           rp.handle AS rider_handle
    FROM driver_to_rider_hmus h
    LEFT JOIN driver_profiles dp ON dp.user_id = h.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = h.rider_id
    WHERE (${marketId}::uuid IS NULL OR h.market_id = ${marketId}::uuid)
    ORDER BY h.created_at DESC
    LIMIT 50
  `;

  // Top senders today (ET calendar day, matching the fee-cap pattern).
  const topSenders = await sql`
    SELECT h.driver_id, COUNT(*)::int AS sends,
           dp.handle AS driver_handle, dp.display_name AS driver_name
    FROM driver_to_rider_hmus h
    LEFT JOIN driver_profiles dp ON dp.user_id = h.driver_id
    WHERE h.created_at >= (NOW() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York'
      AND (${marketId}::uuid IS NULL OR h.market_id = ${marketId}::uuid)
    GROUP BY h.driver_id, dp.handle, dp.display_name
    ORDER BY sends DESC
    LIMIT 10
  `;

  return NextResponse.json({ recent, topSenders });
}
