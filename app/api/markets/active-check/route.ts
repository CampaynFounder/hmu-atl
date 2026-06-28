import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveMarketByGeo } from '@/lib/markets/geo';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '');
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  const result = await resolveMarketByGeo(lat, lng);

  // Passively waitlist signed-in users who land outside a live market.
  if (!result.isActive) {
    void captureWaitlist(userId, result.marketSlug);
  }

  return NextResponse.json(result);
}

async function captureWaitlist(userId: string, marketSlug: string | null) {
  try {
    const userRows = await sql`SELECT phone FROM users WHERE clerk_id = ${userId} LIMIT 1`;
    if (!userRows.length) return;
    const phone = (userRows[0] as { phone: string | null }).phone;
    if (!phone) return;
    await sql`
      INSERT INTO market_waitlist (phone, market_slug, source)
      VALUES (${phone}, ${marketSlug}, 'mobile_auth')
      ON CONFLICT (phone) DO NOTHING
    `;
  } catch {}
}
