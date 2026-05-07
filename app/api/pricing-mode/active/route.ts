import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolvePricingStrategy, resolveGlobalDefault } from '@/lib/payments/strategies';

/**
 * Returns the pricing mode currently in effect for the calling user.
 * Public-ish: requires auth but exposes only mode flags, no money numbers.
 *
 * Drives UI gates like "hide HMU First when active mode hides_subscription".
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  const userId = (userRows[0] as { id?: string } | undefined)?.id;

  const strategy = userId
    ? await resolvePricingStrategy(userId)
    : await resolveGlobalDefault();

  // We need the hides_subscription flag from the row. Re-query the row by
  // mode_key — strategies don't carry the DB row themselves.
  const modeRows = await sql`
    SELECT hides_subscription
    FROM pricing_modes
    WHERE mode_key = ${strategy.modeKey}
    LIMIT 1
  `;
  const hidesSubscription = !!(modeRows[0] as Record<string, unknown> | undefined)?.hides_subscription;

  return NextResponse.json({
    modeKey: strategy.modeKey,
    displayName: strategy.displayName,
    hidesSubscription,
  });
}
