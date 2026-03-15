import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';
import sql from '../../../../../lib/db/client';
import { disputeRateLimit } from '../../../../lib/rate-limit';

const ablyRest = new Ably.Rest({ key: process.env.ABLY_API_KEY! });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: disputeId } = await params;

  // Rate limiting
  const { success: rateLimitOk } = await disputeRateLimit.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Look up internal user
  const users = await sql`
    SELECT id, user_type FROM users WHERE auth_provider_id = ${userId} LIMIT 1
  `;
  if (users.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const internalUserId: string = users[0].id;

  // Fetch dispute
  const disputes = await sql`
    SELECT d.*, r.rider_id, r.driver_id
    FROM disputes d
    JOIN rides r ON r.id = d.ride_id
    WHERE d.id = ${disputeId}
    LIMIT 1
  `;

  if (disputes.length === 0) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  const dispute = disputes[0];

  // Only the rider, driver, or an admin can view the dispute
  const isParty =
    dispute.rider_id === internalUserId || dispute.driver_id === internalUserId;
  const isAdmin = users[0].user_type === 'admin';

  if (!isParty && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Pull Ably channel message history (72hr) for the ride's channel
  const channelName = `ride:${dispute.ride_id}`;
  const channel = ablyRest.channels.get(channelName);
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

  let ablyMessages: Ably.Message[] = [];
  let ablyHistoryUrl: string | null = null;

  try {
    const page = await channel.history({
      start: seventyTwoHoursAgo.getTime(),
      direction: 'forwards',
      limit: 100,
    });
    ablyMessages = page.items;
    ablyHistoryUrl = `https://rest.ably.io/channels/${encodeURIComponent(channelName)}/messages`;
  } catch (err) {
    console.error('[dispute/get] Failed to fetch Ably history:', err);
  }

  // Store Ably history URL on dispute record if not already set
  if (ablyHistoryUrl && !dispute.ably_history_url) {
    await sql`
      UPDATE disputes
      SET ably_history_url = ${ablyHistoryUrl},
          updated_at = NOW()
      WHERE id = ${disputeId}
    `;
    dispute.ably_history_url = ablyHistoryUrl;
  }

  return NextResponse.json({
    dispute,
    ably_message_history: ablyMessages,
  });
}
