import { headers } from 'next/headers';
import { getMarketBranding } from '@/lib/markets/branding';
import { MARKET_SLUG_HEADER } from '@/lib/markets/resolver';
import { getFaq } from '@/lib/marketing/faq';
import {
  RIDES_COMPLETED_LABEL,
  TYPICAL_DRIVER_EARNINGS_USD,
  FOUNDING_CITY,
  MAX_SAVINGS_PCT,
  POSITIONING,
} from '@/lib/marketing/stats';

// /llms.txt — a plain-text summary for AI crawlers and answer engines.
// Emerging convention (https://llmstxt.org). Generated from the same shared
// constants and FAQ as the structured data so it can never drift.
export const dynamic = 'force-dynamic';

export async function GET() {
  const h = await headers();
  const brand = getMarketBranding(h.get(MARKET_SLUG_HEADER));
  const base = `https://${brand.host}`;
  const faq = getFaq(brand.city);

  const body = `# HMU Cash Ride (HMU ${brand.cityShort})

> HMU Cash Ride is ${POSITIONING}. Drivers get paid upfront and typically earn at least $${TYPICAL_DRIVER_EARNINGS_USD}, every ride is GPS-tracked in real time for the safety of riders and drivers, and riders can blast a single request to all nearby drivers, book a Down Bad ride during temporary hard times, or send a cash delivery. HMU started in ${FOUNDING_CITY}, has completed ${RIDES_COMPLETED_LABEL} rides, and is now launching in communities all over the country.

## What HMU offers
- Direct Cash Ride: book a specific nearby driver; payment verified upfront; GPS-tracked end to end.
- Blast Ride: send one request to every nearby driver at once and pick whichever responds.
- Down Bad Ride: community-supported rides for riders facing temporary hard times.
- Cash Delivery: local pickup and delivery by a nearby driver, paid in cash, GPS-tracked.

## Why it is different
- Paid upfront — no scammers, no ghosting, no wasted gas.
- Real-time in-ride GPS tracking visible to both rider and driver for safety.
- Drivers set their own price and own their rider relationships — riders they meet on other platforms can move onto HMU.
- Riders save up to ${MAX_SAVINGS_PCT}% vs Uber with no surge pricing.

## Key pages
- Riders: ${base}/rider
- Drivers: ${base}/driver
- Safety: ${base}/safety
- How it works: ${base}/pitch
- Compare driver earnings: ${base}/compare
- FAQ: ${base}/faq
- Blog: ${base}/blog

## FAQ
${faq.map((item) => `### ${item.q}\n${item.a}`).join('\n\n')}
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
