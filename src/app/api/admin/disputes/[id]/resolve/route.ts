import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import sql from '../../../../../../../lib/db/client';
import { redis } from '../../../../../../../lib/notifications/redis';
import type { Dispute, Ride } from '../../../../../../../lib/db/types';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:admin:disputes:resolve',
});

async function requireAdmin(req: NextRequest): Promise<{ rejection: NextResponse; adminClerkId: null } | { rejection: null; adminClerkId: string }> {
  const { userId } = await auth();
  if (!userId) return { rejection: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), adminClerkId: null };

  const { success } = await ratelimit.limit(userId);
  if (!success) return { rejection: NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 }), adminClerkId: null };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.publicMetadata?.role !== 'admin') {
    return { rejection: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), adminClerkId: null };
  }

  return { rejection: null, adminClerkId: userId };
}

async function processDriverPayout(ride: Ride): Promise<void> {
  // Delegates to payout processor (Agent 11).
  // Transfers application_fee-adjusted amount to driver's Stripe Connect account.
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiVersion: '2025-01-27.acacia' as any,
  });

  const driverRows = await sql`
    SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${ride.driver_id}
  `;
  const stripeAccountId: string | undefined = (driverRows[0] as { stripe_account_id?: string })?.stripe_account_id;
  if (!stripeAccountId) throw new Error('Driver has no Stripe Connect account');

  const payoutAmount = ride.amount - (ride.application_fee ?? 0);
  await stripe.transfers.create({
    amount: Math.round(payoutAmount * 100),
    currency: 'usd',
    destination: stripeAccountId,
    transfer_group: ride.id,
    metadata: { ride_id: ride.id, reason: 'dispute_resolved_driver' },
  });
}

async function processRiderRefund(ride: Ride): Promise<void> {
  // Refunds the rider's payment intent in full.
  if (!ride.payment_intent_id) throw new Error('Ride has no payment intent');

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiVersion: '2025-01-27.acacia' as any,
  });

  await stripe.refunds.create({
    payment_intent: ride.payment_intent_id,
    metadata: { ride_id: ride.id, reason: 'dispute_resolved_rider' },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { rejection } = await requireAdmin(req);
  if (rejection) return rejection;

  const { id: disputeId } = await params;

  let body: { resolution?: string; admin_notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { resolution, admin_notes } = body;

  if (resolution !== 'driver' && resolution !== 'rider') {
    return NextResponse.json({ error: 'resolution must be "driver" or "rider"' }, { status: 400 });
  }
  if (!admin_notes || typeof admin_notes !== 'string') {
    return NextResponse.json({ error: 'admin_notes is required' }, { status: 400 });
  }

  // Fetch the dispute and associated ride
  const disputeRows = await sql`
    SELECT d.*, row_to_json(r) AS ride_json
    FROM disputes d
    JOIN rides r ON r.id = d.ride_id
    WHERE d.id = ${disputeId} AND d.status = 'open'
    LIMIT 1
  `;

  if (!disputeRows[0]) {
    return NextResponse.json({ error: 'Dispute not found or already resolved' }, { status: 404 });
  }

  const dispute = disputeRows[0] as Dispute & { ride_json: Ride };
  const ride = dispute.ride_json;

  try {
    if (resolution === 'driver') {
      await processDriverPayout(ride);
    } else {
      await processRiderRefund(ride);
    }

    await sql`
      UPDATE disputes
      SET
        status      = 'resolved',
        resolved_at = NOW()
      WHERE id = ${disputeId}
    `;

    await sql`
      UPDATE rides
      SET status = 'completed'
      WHERE id = ${ride.id}
    `;

    return NextResponse.json({ ok: true, dispute_id: disputeId, resolution });
  } catch (err) {
    console.error('[admin/disputes/resolve] processor error:', err);
    return NextResponse.json({ error: 'Failed to process resolution' }, { status: 500 });
  }
}
