// GET /api/onboarding/rider-profile-fields-config — public read of the
// rider profile-fields config + market context. Public because the values
// drive UI rendering on rider onboarding flows; nothing here is sensitive.
//
// Mirrors /api/onboarding/driver-express-config: market resolved from
// middleware header / Host / DEFAULT_MARKET_SLUG, areas bundled so the
// home-area picker renders without a second round-trip.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRiderProfileFieldsConfig } from '@/lib/onboarding/rider-profile-fields-config';
import {
  DEFAULT_MARKET_SLUG,
  resolveMarketBySlug,
  resolveMarketForClerkUser,
  resolveMarketFromHeaders,
  resolveMarketFromHost,
  type MarketContext,
} from '@/lib/markets/resolver';
import { getMarketAreas } from '@/lib/markets/areas';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const config = await getRiderProfileFieldsConfig();

  // Market-aware: the authenticated rider's assigned market wins (mobile always
  // hits the atl host). Fall back to header / Host / default for pre-auth web.
  let market: MarketContext | null = null;
  const { userId: clerkId } = await auth();
  if (clerkId) market = await resolveMarketForClerkUser(clerkId);
  if (!market) market = await resolveMarketFromHeaders(req.headers);
  if (!market) market = await resolveMarketFromHost(req.headers.get('host'));
  if (!market) market = await resolveMarketBySlug(DEFAULT_MARKET_SLUG);

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
