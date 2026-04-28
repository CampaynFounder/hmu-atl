// VoIP.ms inbound SMS callback
// Handles both GET (query params) and POST (form body or JSON body)
// Every hit is persisted to voip_webhook_log — including pings, parse failures,
// and missing-field calls — so admins can troubleshoot what voip.ms is sending.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { publishAdminEvent } from '@/lib/ably/server';
import { handleConversationInbound } from '@/lib/conversation/inbound';

interface DebugContext {
  method: string;
  rawQuery: string;
  rawBody: string | null;
  contentType: string;
  userAgent: string;
}

async function logWebhookHit(
  ctx: DebugContext,
  source: string,
  outcome: 'stored' | 'ping' | 'missing_fields' | 'parse_failed',
  parsedParams: Record<string, string> | null,
  fromPhone: string | null,
  toDid: string | null,
  voipmsId: string | null,
  error: string | null,
): Promise<void> {
  try {
    await sql`
      INSERT INTO voip_webhook_log (
        method, source, outcome, raw_query, raw_body, content_type,
        parsed_params, from_phone, to_did, voipms_id, error, user_agent
      ) VALUES (
        ${ctx.method}, ${source}, ${outcome},
        ${ctx.rawQuery || null}, ${ctx.rawBody}, ${ctx.contentType || null},
        ${parsedParams ? JSON.stringify(parsedParams) : null},
        ${fromPhone}, ${toDid}, ${voipmsId}, ${error}, ${ctx.userAgent || null}
      )
    `;
  } catch (e) {
    console.error('[VOIPMS WEBHOOK] log insert failed:', e);
  }
}

async function handleInbound(
  params: Record<string, string>,
  source: string,
  ctx: DebugContext,
) {
  // VoIP.ms uses various field names depending on portal config — accept all known variants
  const from = params.from ?? params.src ?? params.source ?? '';
  const to = params.to ?? params.dst ?? params.destination ?? params.did ?? '';
  const message = params.message ?? params.text ?? params.msg ?? '';
  const voipmsId = params.id ?? params.msg_id ?? '';

  console.log('[VOIPMS WEBHOOK]', { source, params, parsed: { from, to, message: message.slice(0, 50) } });

  if (!from || !message) {
    await logWebhookHit(ctx, source, 'ping', params, null, null, voipmsId || null, null);
    return NextResponse.json({ status: 'ok', reason: 'empty_or_validation_ping' });
  }

  const fromPhone = from.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  const toDid = to.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');

  let storeError: string | null = null;
  try {
    await sql`
      INSERT INTO sms_inbound (from_phone, to_did, message, voipms_id)
      VALUES (${fromPhone}, ${toDid}, ${message}, ${voipmsId || null})
    `;
    console.log('[VOIPMS WEBHOOK] Stored inbound from', fromPhone);
  } catch (error) {
    storeError = error instanceof Error ? error.message : String(error);
    console.error('[VOIPMS WEBHOOK] DB insert failed:', error);
  }

  await logWebhookHit(
    ctx,
    source,
    storeError ? 'parse_failed' : 'stored',
    params,
    fromPhone || null,
    toDid || null,
    voipmsId || null,
    storeError,
  );

  try {
    await publishAdminEvent('sms_inbound', { from: fromPhone, message, to: toDid, timestamp: Date.now() });
  } catch (error) {
    console.error('[VOIPMS WEBHOOK] Ably publish failed:', error);
  }

  // Conversation agent routing — additive. Short-circuits internally if the
  // feature flag is off or the sender has no active thread. STOP keyword
  // handling also lives here.
  try {
    await handleConversationInbound(fromPhone, message, voipmsId || null);
  } catch (error) {
    console.error('[VOIPMS WEBHOOK] conversation routing failed:', error);
  }

  return NextResponse.json({ status: 'ok' });
}

function paramsFromSearchParams(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => { out[k] = v; });
  return out;
}

// VoIP.ms ships JSON callbacks in a nested envelope (observed 2026-04-28):
//   { data: { event_type, payload: { from: {phone_number}, to: [{phone_number}], text, id } } }
// Flatten it into the flat key/value shape handleInbound expects.
function flattenVoipmsJson(body: unknown): Record<string, string> | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;

  // Already-flat shape (legacy / form-style JSON)
  if (typeof root.from === 'string' || typeof root.message === 'string' || typeof root.text === 'string') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(root)) {
      if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
    }
    return out;
  }

  // Nested envelope: data.payload.{from, to, text, id}
  const data = root.data as Record<string, unknown> | undefined;
  const payload = (data?.payload ?? root.payload) as Record<string, unknown> | undefined;
  if (!payload) return null;

  const fromObj = payload.from as { phone_number?: string } | undefined;
  const toArr = payload.to as Array<{ phone_number?: string }> | undefined;
  const text = payload.text as string | undefined;
  const id = payload.id;

  const from = fromObj?.phone_number ?? '';
  const to = Array.isArray(toArr) && toArr[0]?.phone_number ? toArr[0].phone_number : '';
  if (!from && !text) return null;

  return {
    from,
    to,
    message: typeof text === 'string' ? text : '',
    id: id != null ? String(id) : '',
  };
}

function buildContext(req: NextRequest, rawBody: string | null): DebugContext {
  return {
    method: req.method,
    rawQuery: req.nextUrl.search.replace(/^\?/, ''),
    rawBody,
    contentType: req.headers.get('content-type') ?? '',
    userAgent: req.headers.get('user-agent') ?? '',
  };
}

export async function GET(req: NextRequest) {
  const ctx = buildContext(req, null);
  const params = paramsFromSearchParams(req.nextUrl.searchParams);
  return handleInbound(params, 'GET', ctx);
}

export async function POST(req: NextRequest) {
  // Read raw body once so we can log it AND still parse it.
  let rawBody: string | null = null;
  try {
    rawBody = await req.text();
  } catch {
    rawBody = null;
  }
  const ctx = buildContext(req, rawBody);

  // Try query params first (some providers send POST with query params)
  const qp = paramsFromSearchParams(req.nextUrl.searchParams);
  if (qp.from || qp.src) {
    return handleInbound(qp, 'POST_QUERY', ctx);
  }

  // Try form-encoded body
  if (ctx.contentType.includes('form') && rawBody) {
    try {
      const formParams: Record<string, string> = {};
      const usp = new URLSearchParams(rawBody);
      usp.forEach((v, k) => { formParams[k] = v; });
      return handleInbound(formParams, 'POST_FORM', ctx);
    } catch (e) {
      console.error('[VOIPMS WEBHOOK] form parse failed:', e);
      await logWebhookHit(ctx, 'POST_FORM', 'parse_failed', null, null, null, null,
        e instanceof Error ? e.message : 'form parse failed');
      return NextResponse.json({ status: 'ok' });
    }
  }

  // Try JSON body — voip.ms sends a nested envelope, not a flat record.
  if (rawBody) {
    try {
      const body = JSON.parse(rawBody);
      const flat = flattenVoipmsJson(body);
      if (flat) {
        return handleInbound(flat, 'POST_JSON', ctx);
      }
      // JSON parsed but no recognizable SMS shape — log raw body so we can see what voip sent
      await logWebhookHit(ctx, 'POST_JSON', 'missing_fields', body as Record<string, string>, null, null, null,
        'json parsed but no from/text recognized');
      return NextResponse.json({ status: 'ok' });
    } catch (e) {
      await logWebhookHit(ctx, 'POST_JSON', 'parse_failed', null, null, null, null,
        e instanceof Error ? e.message : 'json parse failed');
      console.log('[VOIPMS WEBHOOK] Unknown body format, returning 200');
      return NextResponse.json({ status: 'ok' });
    }
  }

  await logWebhookHit(ctx, 'POST_UNKNOWN', 'parse_failed', null, null, null, null, 'empty body');
  return NextResponse.json({ status: 'ok' });
}
