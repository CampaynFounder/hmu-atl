// POST /api/driver/hmu — driver sends a directed HMU to a specific rider.
// Enforces daily cap from platform_config, writes persistent notification,
// pushes Ably event to rider's personal channel.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';
import { sendHmu } from '@/lib/hmu/helpers';
import { notifyUser } from '@/lib/ably/server';
import { sendSms } from '@/lib/sms/textbee';

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

  // market_id used to stamp the HMU row for audit/admin filtering.
  // Presence gating was removed on 2026-04-23 — drivers can HMU riders
  // without being "live." If we want to throttle non-live drivers later,
  // do it as a rate-limit bucket rather than a hard block.
  const marketRows = await sql`SELECT market_id FROM users WHERE id = ${user.id} LIMIT 1`;
  const driverMarketId = (marketRows[0]?.market_id as string | null) ?? null;

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

  // SMS to the rider — only on a fresh send (isNewSend), not on an UPSERT
  // refresh, so we don't spam on repeat taps. Failures are non-fatal.
  if (result.isNewSend) {
    try {
      const riderRows = await sql`
        SELECT u.phone AS user_phone, rp.phone AS profile_phone, rp.first_name
        FROM users u LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.id = ${body.riderId} LIMIT 1
      `;
      const driverRows = await sql`
        SELECT dp.display_name, dp.handle
        FROM driver_profiles dp WHERE dp.user_id = ${user.id} LIMIT 1
      `;
      const riderPhone = (riderRows[0]?.user_phone as string | null) || (riderRows[0]?.profile_phone as string | null);
      const firstName = (riderRows[0]?.first_name as string | null) || 'there';
      const driverName = (driverRows[0]?.display_name as string | null) || (driverRows[0]?.handle as string | null) || 'A driver';

      if (riderPhone) {
        const marketRows = await sql`SELECT slug FROM markets WHERE id = ${driverMarketId} LIMIT 1`;
        const marketSlug = (marketRows[0]?.slug as string | null) || 'atl';
        const message = `Hey ${firstName}! ${driverName} just HMU'd you on HMU ATL. Link up → atl.hmucashride.com/rider/home`;
        await sendSms(riderPhone, message, { market: marketSlug, eventType: 'hmu_received' });
      }
    } catch (err) {
      console.error('[hmu-send] SMS notify failed (non-fatal):', err);
    }
  }

  return NextResponse.json({ ok: true, hmuId: result.hmuId, isNewSend: !!result.isNewSend });
}
