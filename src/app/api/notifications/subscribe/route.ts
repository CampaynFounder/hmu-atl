import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription } from '../../../../../lib/notifications/webpush';
import type { PushSubscriptionPayload } from '../../../../../lib/notifications/webpush';
import { neon } from '@neondatabase/serverless';

/**
 * POST /api/notifications/subscribe
 *
 * Body: { subscription: PushSubscriptionPayload }
 *
 * Saves the browser push subscription to Neon for the authenticated user.
 * Requires a valid Clerk session.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve internal user ID from clerk_id
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 403 });
  }
  const userId = rows[0].id as string;

  let body: { subscription?: PushSubscriptionPayload };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { subscription } = body;

  if (
    !subscription?.endpoint ||
    !subscription?.keys?.p256dh ||
    !subscription?.keys?.auth
  ) {
    return NextResponse.json(
      { error: 'subscription with endpoint and keys (p256dh, auth) is required' },
      { status: 400 }
    );
  }

  try {
    await saveSubscription(userId, subscription);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[notify/subscribe] error saving subscription', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
