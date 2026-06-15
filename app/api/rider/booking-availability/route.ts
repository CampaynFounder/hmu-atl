// GET /api/rider/booking-availability
// Returns which booking types are live for the rider's market, so the mobile
// home can render disabled types as "COMING SOON" instead of routing into them.
// Down Bad ANDs the global down_bad.config master switch on top of the
// per-market flag (matches the create route in /api/rider/down-bad).

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { getMarketBookingFlags } from '@/lib/markets/booking-types';
import { getPlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve market via the rider's clerk id → user id → market.
  let market: Awaited<ReturnType<typeof resolveMarketForUser>> | null = null;
  try {
    // resolveMarketForUser expects the internal user id; look it up first.
    const { sql } = await import('@/lib/db/client');
    const rows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    const userId = (rows[0] as { id: string } | undefined)?.id;
    if (userId) market = await resolveMarketForUser(userId);
  } catch {
    market = null;
  }

  // No resolvable market → everything off (fails closed; rider sees COMING SOON).
  if (!market) {
    return NextResponse.json({ direct: false, blast: false, downBad: false, delivery: false });
  }

  const [flags, downBadCfg] = await Promise.all([
    getMarketBookingFlags(market.market_id),
    getPlatformConfig('down_bad.config', { enabled: false } as Record<string, unknown>),
  ]);

  return NextResponse.json({
    direct: flags.direct,
    blast: flags.blast,
    downBad: flags.downBad && downBadCfg.enabled === true,
    delivery: flags.delivery,
  });
}
