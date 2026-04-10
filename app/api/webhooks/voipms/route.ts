// VoIP.ms inbound SMS callback
// Handles both GET (query params) and POST (form body or JSON body)
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { publishAdminEvent } from '@/lib/ably/server';

async function handleInbound(params: Record<string, string>, rawSource: string) {
  // VoIP.ms uses various field names depending on portal config — accept all known variants
  const from = params.from ?? params.src ?? params.source ?? '';
  const to = params.to ?? params.dst ?? params.destination ?? params.did ?? '';
  const message = params.message ?? params.text ?? params.msg ?? '';
  const voipmsId = params.id ?? params.msg_id ?? '';

  console.log('[VOIPMS WEBHOOK]', { source: rawSource, params, parsed: { from, to, message: message.slice(0, 50) } });

  if (!from || !message) {
    // Return 200 for validation pings from VoIP.ms
    return NextResponse.json({ status: 'ok', reason: 'empty_or_validation_ping' });
  }

  const fromPhone = from.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  const toDid = to.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');

  try {
    await sql`
      INSERT INTO sms_inbound (from_phone, to_did, message, voipms_id)
      VALUES (${fromPhone}, ${toDid}, ${message}, ${voipmsId || null})
    `;
    publishAdminEvent('sms_inbound', { from: fromPhone, message }).catch(() => {});
    console.log('[VOIPMS WEBHOOK] Stored inbound from', fromPhone);
  } catch (error) {
    console.error('[VOIPMS WEBHOOK] DB insert failed:', error);
  }

  return NextResponse.json({ status: 'ok' });
}

function paramsFromSearchParams(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => { out[k] = v; });
  return out;
}

export async function GET(req: NextRequest) {
  const params = paramsFromSearchParams(req.nextUrl.searchParams);
  return handleInbound(params, 'GET');
}

export async function POST(req: NextRequest) {
  // Try query params first (some providers send POST with query params)
  const qp = paramsFromSearchParams(req.nextUrl.searchParams);
  if (qp.from || qp.src) {
    return handleInbound(qp, 'POST_QUERY');
  }

  // Try form-encoded body
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('form')) {
    try {
      const formData = await req.formData();
      const params: Record<string, string> = {};
      formData.forEach((v, k) => { params[k] = v.toString(); });
      return handleInbound(params, 'POST_FORM');
    } catch (e) {
      console.error('[VOIPMS WEBHOOK] form parse failed:', e);
    }
  }

  // Try JSON body
  try {
    const body = await req.json();
    return handleInbound(body as Record<string, string>, 'POST_JSON');
  } catch {
    console.log('[VOIPMS WEBHOOK] Unknown body format, returning 200');
    return NextResponse.json({ status: 'ok' });
  }
}
