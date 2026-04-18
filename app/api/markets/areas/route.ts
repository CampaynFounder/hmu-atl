import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getMarketAreas } from '@/lib/markets/areas';
import { resolveMarketForUser } from '@/lib/markets/resolver';

/**
 * GET /api/markets/areas
 * Returns the area catalog for the current user's market, grouped by cardinal.
 * Used by driver profile area picker + rider post composer chips.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  const market = await resolveMarketForUser(userId);
  const rows = await getMarketAreas(market.market_id);

  return NextResponse.json({
    market: { slug: market.slug, name: market.name },
    areas: rows.map(r => ({
      slug: r.slug,
      name: r.name,
      cardinal: r.cardinal,
      sort_order: r.sort_order,
    })),
  });
}
