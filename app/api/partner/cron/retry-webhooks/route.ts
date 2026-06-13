// POST /api/partner/cron/retry-webhooks
// Redelivers pending partner webhooks whose backoff has elapsed. Auth: CRON_SECRET
// via X-Cron-Secret header (same as the blast crons). Invoked by the GitHub
// Actions scheduled workflow (.github/workflows/cron.yml).

import { NextRequest, NextResponse } from 'next/server';
import { retryPartnerWebhooks } from '@/lib/partner/webhooks';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? '';
    if (got !== expected) {
      return NextResponse.json({ error: 'forbidden' }, { status: 401 });
    }
  }

  try {
    const processed = await retryPartnerWebhooks();
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    console.error('[partner/cron/retry-webhooks]', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
