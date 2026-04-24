// Driver list endpoint for the chat-booking admin page's overrides table.
// GET ?q=<query> → returns drivers with their current override status
// (null = inherit, true = force ON, false = force OFF).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { getChatBookingConfig } from '@/lib/chat/config';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const q = (params.get('q') ?? '').trim().slice(0, 80);
  const marketId = (params.get('market_id') ?? '').trim() || null;
  const qLike = q ? `%${q}%` : null;

  // Sort by override presence first (all explicitly-configured drivers bubble
  // to the top) then by chill_score + completed_rides so popular drivers
  // surface next. `dp.handle IS NOT NULL` filters out signup-abandoned rows.
  const rows = (await sql`
    SELECT
      dp.user_id AS driver_id,
      dp.handle,
      dp.display_name,
      dp.first_name,
      u.tier,
      u.chill_score,
      u.completed_rides,
      u.market_id
    FROM driver_profiles dp
    INNER JOIN users u ON u.id = dp.user_id
    WHERE dp.handle IS NOT NULL
      AND u.account_status = 'active'
      AND u.profile_type = 'driver'
      AND (
        ${qLike}::text IS NULL
        OR dp.handle ILIKE ${qLike}
        OR dp.display_name ILIKE ${qLike}
        OR dp.first_name ILIKE ${qLike}
      )
      AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId}::uuid)
    ORDER BY u.chill_score DESC NULLS LAST, u.completed_rides DESC
    LIMIT 50
  `) as Array<{
    driver_id: string; handle: string; display_name: string | null; first_name: string | null;
    tier: string; chill_score: number | null; completed_rides: number | null;
    market_id: string | null;
  }>;

  const cfg = await getChatBookingConfig();
  const drivers = rows.map((r) => {
    const ov = cfg.driver_overrides?.[r.driver_id];
    return {
      driver_id: r.driver_id,
      handle: r.handle,
      display_name: r.display_name || r.first_name || r.handle,
      tier: r.tier,
      chill_score: Number(r.chill_score ?? 0),
      completed_rides: Number(r.completed_rides ?? 0),
      override: typeof ov === 'boolean' ? ov : null,
      effective: typeof ov === 'boolean' ? ov : cfg.enabled,
    };
  });

  return NextResponse.json({ drivers, global_enabled: cfg.enabled });
}
