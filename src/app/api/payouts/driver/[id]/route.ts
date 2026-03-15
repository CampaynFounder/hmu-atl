/**
 * GET /api/payouts/driver/[id]
 *
 * Returns the payout history for a specific driver.
 * Callers can only fetch their own history unless they are admin.
 *
 * Protected by Clerk auth middleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDriverPayouts } from '../../../../../../lib/payout';
import posthog from '../../../../../../lib/posthog';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: driverId } = await params;

  // Only allow users to see their own payouts (unless admin)
  const publicMetadata = (sessionClaims?.metadata ?? {}) as Record<string, unknown>;
  const isAdmin = publicMetadata.role === 'admin';

  if (!isAdmin && userId !== driverId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const payouts = await getDriverPayouts(driverId);

    posthog.capture({
      distinctId: userId,
      event: 'payout_history_viewed',
      properties: { driver_id: driverId, count: payouts.length },
    });

    return NextResponse.json({ driver_id: driverId, payouts });
  } catch (err) {
    console.error('[payouts/driver] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
