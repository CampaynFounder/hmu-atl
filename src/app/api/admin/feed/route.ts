import { NextRequest, NextResponse } from 'next/server';
import Ably from 'ably';
import { createHmac } from 'crypto';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import sql from '@/lib/admin/db';

const ADMIN_FEED_CHANNEL = 'admin:feed';

// Lazy Ably REST client (server-side publish only)
function getAbly() {
  return new Ably.Rest({ key: process.env.ABLY_API_KEY! });
}

// -----------------------------------------------------------------------
// POST /api/admin/feed
// Dual-purpose:
//   1. Internal services push events here → forwarded to Ably admin:feed
//   2. Ably webhook deliveries → ingested into Neon for audit
// -----------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // --- Ably webhook path (no admin JWT, has x-ably-signature) ----------
  const ablySignature = req.headers.get('x-ably-signature');
  if (ablySignature) {
    return handleAblyWebhook(rawBody, ablySignature);
  }

  // --- Internal publish path (requires admin JWT) ----------------------
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let payload: { name: string; data: unknown };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const ably = getAbly();
  const channel = ably.channels.get(ADMIN_FEED_CHANNEL);
  await channel.publish(payload.name, payload.data);

  return NextResponse.json({ published: true, channel: ADMIN_FEED_CHANNEL });
}

// -----------------------------------------------------------------------
// GET /api/admin/feed
// Returns an Ably token request for the admin dashboard to subscribe
// directly to admin:feed without exposing the API key.
// -----------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const ably = getAbly();
  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: auth.userId,
    capability: { [ADMIN_FEED_CHANNEL]: ['subscribe'] },
  });

  return NextResponse.json(tokenRequest);
}

// -----------------------------------------------------------------------
// Ably webhook signature verification + event ingestion
// -----------------------------------------------------------------------
async function handleAblyWebhook(
  rawBody: string,
  signature: string,
): Promise<NextResponse> {
  const secret = process.env.ABLY_WEBHOOK_SECRET;

  if (secret) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    if (signature !== expected) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let parsed: { items?: AblyWebhookItem[] };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const items: AblyWebhookItem[] = Array.isArray(parsed.items)
    ? parsed.items
    : [];

  if (items.length === 0) {
    return NextResponse.json({ ingested: 0 });
  }

  // Bulk insert into admin_feed_events for audit trail
  for (const item of items) {
    await sql`
      INSERT INTO admin_feed_events
        (channel, event_name, data, ably_timestamp, created_at)
      VALUES
        (${item.channel ?? ADMIN_FEED_CHANNEL},
         ${item.name    ?? 'unknown'},
         ${JSON.stringify(item.data ?? {})}::jsonb,
         TO_TIMESTAMP(${(item.timestamp ?? Date.now()) / 1000}),
         NOW())
      ON CONFLICT DO NOTHING
    `;
  }

  return NextResponse.json({ ingested: items.length });
}

interface AblyWebhookItem {
  channel?: string;
  name?: string;
  data?: unknown;
  timestamp?: number;
}
