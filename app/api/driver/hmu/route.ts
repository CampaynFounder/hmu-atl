// POST /api/driver/hmu — driver sends a directed HMU to a specific rider.
// Enforces daily cap from platform_config, writes persistent notification,
// pushes Ably event to rider's personal channel.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { sendHmu } from '@/lib/hmu/helpers';
import { notifyUser, isClientInPresence } from '@/lib/ably/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.profile_type !== 'driver') {
    return NextResponse.json({ error: 'Drivers only' }, { status: 403 });
  }
  if (user.account_status !== 'active') {
    return NextResponse.json({ error: 'Account not active' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { riderId?: string; message?: string };
  if (!body.riderId) {
    return NextResponse.json({ error: 'riderId required' }, { status: 400 });
  }

  // market_id + slug — slug drives the Ably presence channel we gate sends on.
  const marketRows = await sql`
    SELECT u.market_id, m.slug
    FROM users u LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.id = ${user.id} LIMIT 1
  `;
  const driverMarketId = (marketRows[0]?.market_id as string | null) ?? null;
  const driverMarketSlug = (marketRows[0]?.slug as string | null) ?? null;

  // Presence gate: driver must be "live" on their market's drivers_available channel.
  // Fail closed if we can't resolve the channel — the product decision is that
  // HMU-send is an explicit, in-the-moment action while the driver is available.
  if (!driverMarketSlug) {
    return NextResponse.json(
      { error: 'not_present', reason: 'no_market' },
      { status: 409 },
    );
  }
  const present = await isClientInPresence(`market:${driverMarketSlug}:drivers_available`, user.id);
  if (!present) {
    return NextResponse.json(
      { error: 'not_present', reason: 'presence_missing' },
      { status: 409 },
    );
  }

  const result = await sendHmu({
    driverId: user.id,
    driverTier: (user.tier === 'hmu_first' ? 'hmu_first' : 'free') as 'free' | 'hmu_first',
    driverMarketId,
    riderId: body.riderId,
    message: body.message ?? null,
  });

  if (!result.ok) {
    const status =
      result.reason === 'cap_exceeded' ? 429 :
      result.reason === 'blocked' ? 403 :
      result.reason === 'self' ? 400 :
      404;
    return NextResponse.json({ error: result.reason, ...result }, { status });
  }

  // Persistent notification for badge count on rider side
  await sql`
    INSERT INTO user_notifications (user_id, type, payload)
    VALUES (${body.riderId}, 'hmu_received', ${JSON.stringify({ hmuId: result.hmuId, driverId: user.id })}::jsonb)
  `;

  // Real-time Ably push so an open rider session reflects the badge immediately
  await notifyUser(body.riderId, 'hmu_received', { hmuId: result.hmuId, driverId: user.id });

  return NextResponse.json({ ok: true, hmuId: result.hmuId });
}
