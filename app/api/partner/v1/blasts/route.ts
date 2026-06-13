// POST /api/partner/v1/blasts — broadcast a delivery request to matched drivers.
// Auth: blasts:write. Idempotency-Key supported.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { authenticatePartner } from '@/lib/partner/auth';
import { createPartnerBlast, type BlastInput } from '@/lib/partner/blast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const auth = await authenticatePartner(req, rawBody, 'blasts:write');
  if (!auth.ok) return auth.res;
  const ctx = auth.ctx;

  const idemKey = req.headers.get('idempotency-key')?.trim() || '';
  if (idemKey) {
    const prior = await sql`SELECT response_status, response_body FROM api_idempotency WHERE partner_id = ${ctx.partner.id} AND idem_key = ${idemKey} LIMIT 1`;
    if (prior[0]) {
      const r = prior[0] as { response_status: number; response_body: unknown };
      return NextResponse.json(r.response_body, { status: r.response_status });
    }
  }

  let body: BlastInput;
  try { body = rawBody ? (JSON.parse(rawBody) as BlastInput) : {}; }
  catch { return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 }); }

  let status: number;
  let payload: Record<string, unknown>;
  try {
    const result = await createPartnerBlast(ctx, body);
    if (result.ok) {
      status = 201;
      payload = { blast_id: result.data.blastId, targeted_count: result.data.targetedCount, expires_at: result.data.expiresAt, fee_split: result.data.feeSplit };
    } else {
      status = result.httpStatus;
      payload = { error: result.error, message: result.message };
    }
  } catch (e) {
    console.error('[partner/v1/blasts] create failed', e);
    return NextResponse.json({ error: 'internal_error', message: 'Could not create blast' }, { status: 500 });
  }

  if (idemKey && status < 500) {
    await sql`INSERT INTO api_idempotency (partner_id, idem_key, response_status, response_body)
              VALUES (${ctx.partner.id}, ${idemKey}, ${status}, ${JSON.stringify(payload)}::jsonb)
              ON CONFLICT (partner_id, idem_key) DO NOTHING`.catch(() => {});
  }
  return NextResponse.json(payload, { status });
}
