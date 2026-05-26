import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

// Vendor connectivity pings — called by the smoke test runner.
// Authenticated via shared webhook secret (not Clerk) so GH Actions can call it.
// Read-only: no data is mutated, no SMS is sent, no charges are made.
// All pings run in parallel so total latency = slowest vendor, not the sum.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-smoke-secret');
  if (!process.env.SMOKE_WEBHOOK_SECRET || secret !== process.env.SMOKE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  async function ping(name: string, fn: () => Promise<void>): Promise<[string, { ok: boolean; error?: string; ms: number }]> {
    const start = Date.now();
    try {
      await fn();
      return [name, { ok: true, ms: Date.now() - start }];
    } catch (e) {
      return [name, { ok: false, error: String(e), ms: Date.now() - start }];
    }
  }

  const settled = await Promise.all([
    ping('neon', async () => {
      await sql`SELECT 1`;
    }),

    ping('ably', async () => {
      if (!process.env.ABLY_API_KEY) throw new Error('ABLY_API_KEY not set');
      const [keyName, keySecret] = process.env.ABLY_API_KEY.split(':');
      const res = await fetch(`https://rest.ably.io/keys/${keyName}/requestToken`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyName}:${keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        // Ably requires keyName and timestamp in the request body
        body: JSON.stringify({ keyName, timestamp: Date.now(), capability: '{"smoke:test":["subscribe"]}', ttl: 5000 }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),

    ping('stripe', async () => {
      if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        httpClient: Stripe.createFetchHttpClient(),
      });
      await Promise.race([
        stripe.events.list({ limit: 1 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
    }),

    ping('openai', async () => {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
  ]);

  const results = Object.fromEntries(settled);
  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, vendors: results });
}
