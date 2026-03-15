import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';
import { neon } from '@neondatabase/serverless';
import { disputeRateLimit } from '../../../lib/rate-limit';
import type { Dispute } from '../../../../../lib/db/types';

const sql = neon(process.env.DATABASE_URL!);

let _ablyRest: Ably.Rest | null = null;
function getAblyRest(): Ably.Rest {
  if (!_ablyRest) {
    _ablyRest = new Ably.Rest({ key: process.env.ABLY_API_KEY! });
  }
  return _ablyRest;
}

/**
 * GET /api/disputes/[id]
 *
 * Fetch a dispute record with its associated Ably message history (72-hour window).
 * The Ably history URL is persisted on the dispute record for future reference.
 * Accessible by the rider, driver, or any admin on the dispute's ride.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: disputeId } = await params;

  const { success: allowed } = await disputeRateLimit.limit(userId);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Resolve Clerk userId → internal user
  const userRows = await sql`
    SELECT id, user_type FROM users WHERE auth_provider_id = ${userId} AND is_active = true LIMIT 1
  `;
  if (userRows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const internalUserId = userRows[0].id as string;
  const userType = userRows[0].user_type as string;

  // Fetch dispute and join ride parties
  const rows = await sql<(Dispute & { rider_id: string; driver_id: string })[]>`
    SELECT d.*, r.rider_id, r.driver_id
    FROM disputes d
    JOIN rides r ON r.id = d.ride_id
    WHERE d.id = ${disputeId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }
  const dispute = rows[0];

  // Access control: rider, driver, or admin
  const isParty =
    dispute.rider_id === internalUserId || dispute.driver_id === internalUserId;
  const isAdmin = userType === 'admin';

  if (!isParty && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Pull Ably channel message history for the past 72 hours
  const channelName = `ride:${dispute.ride_id}`;
  const seventyTwoHoursAgo = Date.now() - 72 * 60 * 60 * 1000;

  let ablyMessages: Ably.Message[] = [];
  let ablyHistoryUrl: string | null = null;

  try {
    const ably = getAblyRest();
    const channel = ably.channels.get(channelName);
    const page = await channel.history({
      start: seventyTwoHoursAgo,
      direction: 'forwards',
      limit: 100,
    });
    ablyMessages = page.items;
    ablyHistoryUrl = `https://rest.ably.io/channels/${encodeURIComponent(channelName)}/messages`;
  } catch (err) {
    console.error('[disputes/get] Ably history fetch failed:', err);
  }

  // Persist the Ably history URL on the dispute record if not already stored
  if (ablyHistoryUrl && !dispute.ably_history_url) {
    await sql`
      UPDATE disputes
      SET ably_history_url = ${ablyHistoryUrl},
          updated_at       = NOW()
      WHERE id = ${disputeId}
    `;
    (dispute as Record<string, unknown>).ably_history_url = ablyHistoryUrl;
  }

  return NextResponse.json({ dispute, ably_message_history: ablyMessages });
}
