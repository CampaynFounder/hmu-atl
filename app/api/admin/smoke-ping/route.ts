import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

// Vendor connectivity pings — called by the smoke test runner.
// Authenticated via shared webhook secret (not Clerk) so GH Actions can call it.
// Read-only: no data is mutated, no SMS is sent, no charges are made.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-smoke-secret');
  if (!process.env.SMOKE_WEBHOOK_SECRET || secret !== process.env.SMOKE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, { ok: boolean; error?: string; ms: number }> = {};

  // Neon DB
  const dbStart = Date.now();
  try {
    await sql`SELECT 1`;
    results.neon = { ok: true, ms: Date.now() - dbStart };
  } catch (e) {
    results.neon = { ok: false, error: String(e), ms: Date.now() - dbStart };
  }

  // Ably — token issuance via REST API (no persistent connection needed)
  const ablyStart = Date.now();
  try {
    if (!process.env.ABLY_API_KEY) throw new Error('ABLY_API_KEY not set');
    const [keyName, keySecret] = process.env.ABLY_API_KEY.split(':');
    const res = await fetch(`https://rest.ably.io/keys/${keyName}/requestToken`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyName}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ capability: '{"smoke:test":["subscribe"]}', ttl: 5000 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    results.ably = { ok: true, ms: Date.now() - ablyStart };
  } catch (e) {
    results.ably = { ok: false, error: String(e), ms: Date.now() - ablyStart };
  }

  // Stripe — list 1 event (read-only, test mode key)
  const stripeStart = Date.now();
  try {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not set');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    await stripe.events.list({ limit: 1 });
    results.stripe = { ok: true, ms: Date.now() - stripeStart };
  } catch (e) {
    results.stripe = { ok: false, error: String(e), ms: Date.now() - stripeStart };
  }

  // OpenAI — single token completion
  const openaiStart = Date.now();
  try {
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
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    results.openai = { ok: true, ms: Date.now() - openaiStart };
  } catch (e) {
    results.openai = { ok: false, error: String(e), ms: Date.now() - openaiStart };
  }

  // VoIP.ms — account status check (read-only)
  const voipStart = Date.now();
  try {
    if (!process.env.VOIPMS_API_USERNAME || !process.env.VOIPMS_API_PASSWORD) {
      throw new Error('VoIP.ms credentials not set');
    }
    const url = new URL('https://voip.ms/api/v1/rest.php');
    url.searchParams.set('api_username', process.env.VOIPMS_API_USERNAME);
    url.searchParams.set('api_password', process.env.VOIPMS_API_PASSWORD);
    url.searchParams.set('method', 'getBalance');
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as { status: string };
    if (data.status !== 'success') throw new Error(`VoIP.ms status: ${data.status}`);
    results.voipms = { ok: true, ms: Date.now() - voipStart };
  } catch (e) {
    results.voipms = { ok: false, error: String(e), ms: Date.now() - voipStart };
  }

  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, vendors: results });
}
