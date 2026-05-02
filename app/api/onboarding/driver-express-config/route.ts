// GET /api/onboarding/driver-express-config — public read of the express
// onboarding config + market context. Public because the values drive UI
// rendering on the landing + onboarding screens; nothing here is sensitive.
//
// The endpoint resolves the caller's market from the Host header
// (atl.hmucashride.com → atl) or the x-market-slug header set by middleware,
// falling back to DEFAULT_MARKET_SLUG. The market areas are bundled in the
// response so the Areas onboarding step renders without a second round-trip.

import { NextRequest, NextResponse } from 'next/server';
import { getDriverExpressConfig } from '@/lib/onboarding/config';
import {
  DEFAULT_MARKET_SLUG,
  resolveMarketBySlug,
  resolveMarketFromHeaders,
  resolveMarketFromHost,
  type MarketContext,
} from '@/lib/markets/resolver';
import { getMarketAreas } from '@/lib/markets/areas';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const config = await getDriverExpressConfig();

  // Resolve market: prefer middleware header, then Host parsing, then default.
  let market: MarketContext | null = await resolveMarketFromHeaders(req.headers);
  if (!market) market = await resolveMarketFromHost(req.headers.get('host'));
  if (!market) market = await resolveMarketBySlug(DEFAULT_MARKET_SLUG);

  // Return whatever areas the resolved market has. Empty list is fine — the
  // picker handles it gracefully (only the "Anywhere in market" toggle shows).
  const areas = market ? await getMarketAreas(market.market_id) : [];

  return NextResponse.json({
    config,
    market: market
      ? { slug: market.slug, name: market.name }
      : { slug: DEFAULT_MARKET_SLUG, name: 'ATL' },
    marketAreas: areas.map(a => ({
      slug: a.slug,
      name: a.name,
      cardinal: a.cardinal,
    })),
  });
}
