import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { rideId } = body as { rideId?: string };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Build capability — what channels this token can access
    const capability: Record<string, string[]> = {
      [`user:${userId}:notify`]: ['subscribe', 'publish'],
    };

    // Grant admin:feed subscribe for admin users
    const adminRows = await sql`SELECT is_admin FROM users WHERE id = ${userId} LIMIT 1`;
    if ((adminRows[0] as Record<string, unknown>)?.is_admin) {
      capability['admin:feed'] = ['subscribe'];
    }

    // Grant market feed channels — wildcard so the driver's resolved market works
    capability['market:*:feed'] = ['subscribe'];
    // Legacy area:*:feed subscription kept during transition so any unmigrated
    // client code doesn't silently drop realtime events.
    capability['area:*:feed'] = ['subscribe'];

    // If rideId provided, scope to that ride channel
    if (rideId) {
      // Verify user is part of this ride
      const rideRows = await sql`
        SELECT id FROM rides
        WHERE id = ${rideId} AND (driver_id = ${userId} OR rider_id = ${userId})
        LIMIT 1
      `;
      if (rideRows.length) {
        capability[`ride:${rideId}`] = ['subscribe', 'publish', 'presence'];
      }
    }

    // Request token from Ably REST API
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Ably not configured' }, { status: 500 });
    }

    const [keyId, keySecret] = apiKey.split(':');
    const authHeader = btoa(`${keyId}:${keySecret}`);

    const ablyRes = await fetch(`https://rest.ably.io/keys/${keyId}/requestToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        keyName: keyId,
        capability: JSON.stringify(capability),
        clientId: userId,
        ttl: 3600000, // 1 hour
        timestamp: Date.now(),
      }),
    });

    if (!ablyRes.ok) {
      const err = await ablyRes.text();
      console.error('Ably token error:', err);
      return NextResponse.json({ error: 'Failed to get Ably token' }, { status: 500 });
    }

    const tokenDetails = await ablyRes.json();
    return NextResponse.json(tokenDetails);
  } catch (error) {
    console.error('Ably token error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Token request failed' },
      { status: 500 }
    );
  }
}
