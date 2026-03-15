import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import sql from '../../../../../lib/db/client';
import { redis, DISPUTE_TIMER_PREFIX } from '../../../../lib/redis';
import { disputeRateLimit } from '../../../../lib/rate-limit';
import { captureEvent } from '../../../../lib/posthog-server';
import type { DisputeType, DisputeStatus, Priority } from '../../../../../lib/db/types';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limiting
  const { success: rateLimitOk } = await disputeRateLimit.limit(userId);
  if (!rateLimitOk) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: {
    ride_id: string;
    dispute_type: DisputeType;
    description: string;
    evidence_urls?: string[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { ride_id, dispute_type, description, evidence_urls } = body;

  if (!ride_id || !dispute_type || !description) {
    return NextResponse.json(
      { error: 'ride_id, dispute_type, and description are required' },
      { status: 400 }
    );
  }

  // Verify the ride exists and belongs to the requesting user, and is completed
  const rides = await sql`
    SELECT id, rider_id, driver_id, completed_at
    FROM rides
    WHERE id = ${ride_id}
    LIMIT 1
  `;

  if (rides.length === 0) {
    return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
  }

  const ride = rides[0];

  // Lookup internal user id from clerk id
  const users = await sql`
    SELECT id FROM users WHERE auth_provider_id = ${userId} LIMIT 1
  `;
  if (users.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const internalUserId: string = users[0].id;

  // Only the rider of the ride can file a dispute
  if (ride.rider_id !== internalUserId) {
    return NextResponse.json({ error: 'Only the rider can file a dispute for this ride' }, { status: 403 });
  }

  // Check 45-minute dispute window via Redis TTL key
  const timerKey = `${DISPUTE_TIMER_PREFIX}${ride_id}`;
  const timerExists = await redis.exists(timerKey);

  if (!timerExists) {
    return NextResponse.json(
      { error: 'Dispute window has closed. Disputes must be filed within 45 minutes of ride completion.' },
      { status: 400 }
    );
  }

  // Check if a dispute already exists for this ride by this user
  const existing = await sql`
    SELECT id FROM disputes
    WHERE ride_id = ${ride_id} AND raised_by_user_id = ${internalUserId}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json({ error: 'A dispute has already been filed for this ride' }, { status: 409 });
  }

  // Create dispute record
  const status: DisputeStatus = 'open';
  const priority: Priority = 'medium';

  const newDisputes = await sql`
    INSERT INTO disputes (
      ride_id,
      raised_by_user_id,
      dispute_type,
      status,
      priority,
      description,
      evidence_urls,
      refund_amount
    )
    VALUES (
      ${ride_id},
      ${internalUserId},
      ${dispute_type},
      ${status},
      ${priority},
      ${description},
      ${evidence_urls ?? null},
      0
    )
    RETURNING *
  `;

  const dispute = newDisputes[0];

  // Flag both profiles with dispute_count increment and 'in_dispute' status
  await Promise.all([
    sql`
      UPDATE rider_profiles
      SET dispute_count = COALESCE(dispute_count, 0) + 1,
          in_dispute = true,
          updated_at = NOW()
      WHERE user_id = ${internalUserId}
    `,
    sql`
      UPDATE driver_profiles
      SET dispute_count = COALESCE(dispute_count, 0) + 1,
          in_dispute = true,
          updated_at = NOW()
      WHERE user_id = ${ride.driver_id}
    `,
  ]);

  // Check: 3 disputes in 30 days = auto-flag account for admin review
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentDisputes = await sql`
    SELECT COUNT(*) as cnt
    FROM disputes
    WHERE raised_by_user_id = ${internalUserId}
      AND created_at >= ${thirtyDaysAgo}
  `;
  if (parseInt(recentDisputes[0].cnt, 10) >= 3) {
    await sql`
      UPDATE users
      SET flagged_for_review = true,
          updated_at = NOW()
      WHERE id = ${internalUserId}
    `;
  }

  // Retaliation detection: mutual WEIRDO ratings within 5min = flag dispute
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const mutualWeirdoRatings = await sql`
    SELECT COUNT(*) as cnt
    FROM ratings_and_reviews
    WHERE ride_id = ${ride_id}
      AND is_flagged = true
      AND flagged_reason ILIKE '%weirdo%'
      AND created_at >= ${fiveMinAgo}
  `;
  if (parseInt(mutualWeirdoRatings[0].cnt, 10) >= 2) {
    await sql`
      UPDATE disputes
      SET admin_notes = COALESCE(admin_notes || E'\n', '') || '[AUTO] Retaliation flag: mutual WEIRDO ratings within 5 minutes of each other.',
          priority = 'high',
          updated_at = NOW()
      WHERE id = ${dispute.id}
    `;
  }

  // Call transaction agent to freeze funds
  const transactionAgentUrl = process.env.TRANSACTION_AGENT_INTERNAL_URL;
  if (transactionAgentUrl) {
    try {
      await fetch(`${transactionAgentUrl}/api/transactions/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id, dispute_id: dispute.id }),
      });
    } catch {
      // Non-fatal: log but don't block dispute creation
      console.error('[dispute/file] Failed to call transaction agent freeze endpoint');
    }
  }

  // PostHog event
  captureEvent(userId, 'dispute_filed', {
    dispute_id: dispute.id,
    ride_id,
    dispute_type,
  });

  return NextResponse.json({ dispute }, { status: 201 });
}
