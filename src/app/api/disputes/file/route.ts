import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { redis, DISPUTE_TIMER_PREFIX } from '../../../lib/redis';
import { disputeRateLimit } from '../../../lib/rate-limit';
import { captureEvent } from '../../../lib/posthog-server';
import type {
  DisputeType,
  DisputeStatus,
  Priority,
} from '../../../../../lib/db/types';

const sql = neon(process.env.DATABASE_URL!);

/**
 * POST /api/disputes/file
 *
 * Rider files a dispute within the 45-minute window after ride completion.
 * - Validates the Redis dispute:timer:{ride_id} key is still alive
 * - Creates dispute record in Neon
 * - Increments dispute_count and flags both profiles as in_dispute
 * - Calls transaction agent to freeze ride funds
 * - Auto-flags account for admin review if 3 disputes in 30 days
 * - Detects retaliation via mutual WEIRDO ratings within 5 minutes
 * - Emits PostHog event: dispute_filed
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { success: allowed } = await disputeRateLimit.limit(userId);
  if (!allowed) {
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ride_id, dispute_type, description, evidence_urls } = body;

  if (!ride_id || !dispute_type || !description) {
    return NextResponse.json(
      { error: 'ride_id, dispute_type, and description are required' },
      { status: 400 }
    );
  }

  // Resolve Clerk userId → internal user
  const userRows = await sql`
    SELECT id FROM users WHERE auth_provider_id = ${userId} AND is_active = true LIMIT 1
  `;
  if (userRows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const internalUserId = userRows[0].id as string;

  // Verify ride exists and the requester is the rider
  const rideRows = await sql`
    SELECT id, rider_id, driver_id, status FROM rides WHERE id = ${ride_id} LIMIT 1
  `;
  if (rideRows.length === 0) {
    return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
  }
  const ride = rideRows[0];

  if (ride.rider_id !== internalUserId) {
    return NextResponse.json(
      { error: 'Only the rider can file a dispute for this ride' },
      { status: 403 }
    );
  }

  // Check 45-minute dispute window via Redis TTL key set on ride end
  const timerKey = `${DISPUTE_TIMER_PREFIX}${ride_id}`;
  const timerExists = await redis.exists(timerKey);
  if (!timerExists) {
    return NextResponse.json(
      {
        error:
          'Dispute window has closed. Disputes must be filed within 45 minutes of ride completion.',
      },
      { status: 400 }
    );
  }

  // Prevent duplicate disputes for the same ride by the same user
  const existing = await sql`
    SELECT id FROM disputes
    WHERE ride_id = ${ride_id} AND raised_by_user_id = ${internalUserId}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'A dispute has already been filed for this ride' },
      { status: 409 }
    );
  }

  const status: DisputeStatus = 'open';
  const priority: Priority = 'medium';

  // Create dispute record
  const disputeRows = await sql`
    INSERT INTO disputes (
      ride_id,
      raised_by_user_id,
      dispute_type,
      status,
      priority,
      description,
      evidence_urls,
      refund_amount,
      created_at,
      updated_at
    )
    VALUES (
      ${ride_id},
      ${internalUserId},
      ${dispute_type},
      ${status},
      ${priority},
      ${description},
      ${evidence_urls ?? null},
      0,
      NOW(),
      NOW()
    )
    RETURNING *
  `;
  const dispute = disputeRows[0];

  // Increment dispute_count and set in_dispute on both profiles
  await Promise.all([
    sql`
      UPDATE rider_profiles
      SET dispute_count = COALESCE(dispute_count, 0) + 1,
          in_dispute     = true,
          updated_at     = NOW()
      WHERE user_id = ${internalUserId}
    `,
    sql`
      UPDATE driver_profiles
      SET dispute_count = COALESCE(dispute_count, 0) + 1,
          in_dispute     = true,
          updated_at     = NOW()
      WHERE user_id = ${ride.driver_id}
    `,
  ]);

  // Auto-flag account: 3 disputes filed in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentCount = await sql`
    SELECT COUNT(*) AS cnt
    FROM disputes
    WHERE raised_by_user_id = ${internalUserId}
      AND created_at >= ${thirtyDaysAgo.toISOString()}
  `;
  if (parseInt(recentCount[0].cnt as string, 10) >= 3) {
    await sql`
      UPDATE users
      SET flagged_for_review = true,
          updated_at         = NOW()
      WHERE id = ${internalUserId}
    `;
  }

  // Retaliation detection: mutual WEIRDO ratings posted within 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const weirdoCount = await sql`
    SELECT COUNT(*) AS cnt
    FROM ratings_and_reviews
    WHERE ride_id        = ${ride_id}
      AND is_flagged     = true
      AND flagged_reason ILIKE '%weirdo%'
      AND created_at    >= ${fiveMinAgo.toISOString()}
  `;
  if (parseInt(weirdoCount[0].cnt as string, 10) >= 2) {
    await sql`
      UPDATE disputes
      SET admin_notes = COALESCE(admin_notes || E'\n', '') ||
                        '[AUTO] Retaliation flag: mutual WEIRDO ratings within 5 minutes.',
          priority    = 'high',
          updated_at  = NOW()
      WHERE id = ${dispute.id}
    `;
  }

  // Call transaction agent endpoint to freeze ride funds
  const txAgentUrl = process.env.TRANSACTION_AGENT_INTERNAL_URL;
  if (txAgentUrl) {
    try {
      await fetch(`${txAgentUrl}/api/transactions/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id, dispute_id: dispute.id }),
      });
    } catch (err) {
      console.error('[disputes/file] Transaction agent freeze failed:', err);
    }
  }

  captureEvent(userId, 'dispute_filed', {
    dispute_id: dispute.id,
    ride_id,
    dispute_type,
  });

  return NextResponse.json({ dispute }, { status: 201 });
}
