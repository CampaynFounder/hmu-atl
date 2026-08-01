// GET /api/ads/feed?surface=rider_browse|driver_browse
//
// Public. Returns active seed advertisements for the browse surface, scoped to
// the caller's market plus global (market-null) ads. Anonymous callers get
// only global ads. The mobile browse screens interleave these as promo cards.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getAdsForFeed } from '@/lib/db/seed-ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('surface');
  const surface = raw === 'driver_browse' ? 'driver_browse' : 'rider_browse';

  let marketId: string | null = null;
  try {
    const { userId: clerkId } = await auth();
    if (clerkId) {
      const rows = await sql`SELECT market_id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
      marketId = (rows[0]?.market_id as string | null) ?? null;
    }
  } catch { /* anon — global ads only */ }

  try {
    const ads = await getAdsForFeed(surface, marketId);
    return NextResponse.json({ ads });
  } catch (err) {
    console.error('[ads/feed] query failed', err);
    return NextResponse.json({ ads: [] }, { status: 200 });
  }
}
