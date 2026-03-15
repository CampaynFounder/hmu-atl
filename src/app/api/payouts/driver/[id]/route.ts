/**
 * GET /api/payouts/driver/[id]
 *
 * Returns payout history for a driver.
 * Users may only fetch their own history; admins can fetch any driver's history.
 *
 * Protected by Clerk auth middleware (src/middleware.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDriverPayouts } from '../../../../../../lib/payout';
import { captureEvent } from '../../../../../lib/posthog-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: driverId } = await params;

  const publicMetadata = (sessionClaims?.metadata ?? {}) as Record<string, unknown>;
  const isAdmin = publicMetadata.role === 'admin';

  if (!isAdmin && userId !== driverId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const payouts = await getDriverPayouts(driverId);

    captureEvent(userId, 'payout_history_viewed', {
      driver_id: driverId,
      count: payouts.length,
    });

    return NextResponse.json({ driver_id: driverId, payouts });
  } catch (err) {
    console.error('[payouts/driver/[id]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
