// Blast — voip.ms SMS delivery-status webhook handler.
//
// Per docs/BLAST-V3-AGENT-CONTRACT.md §8 (POST /api/blast/voipms/webhook) +
// §9 (writes blast_driver_events with sms_delivered / sms_failed).
//
// IMPORTANT: voip.ms does NOT sign delivery webhooks (per their API docs as of
// 2026-05). For now we accept any payload but log every hit to voip_webhook_log
// for forensic auditing. Production hardening follow-ups:
//   1. Source-IP allowlist (voip.ms publishes a small range; check
//      cf-connecting-ip against it).
//   2. Mutual auth via a query-string secret known only to voip.ms + this
//      worker (configurable per-DID in the voip.ms portal).
//   3. Rate-limit per source IP via Upstash to blunt replay floods.
// Documented as TODOs below — Stream B picks these up alongside the wider
// notify rebuild.
//
// We reuse lib/sms/textbee.ts (the file misleadingly named "textbee" — see
// project memory `sms_provider_actual` — actually wraps voip.ms) for the
// outbound side. This handler is the inbound delivery-status side; the two
// share the voip.ms message_id we store in sms_log.voipms_response.
//
// Lookup: voip.ms message ids are surfaced through sms_log.voipms_response
// (the full JSON body of the send response). We don't have a dedicated
// indexed column for the message id today — adding one would be a schema
// change outside Gate 2.1's scope. For now we do a best-effort JSONB
// containment query; if no row matches we still write the event with the raw
// payload so admins can correlate manually.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DeliveryParams {
  // Common voip.ms delivery field names, case-folded. We accept any of them.
  message_id?: string;
  msg_id?: string;
  id?: string;
  status?: string;
  delivered?: string;
  error?: string;
  to?: string;
  dst?: string;
  did?: string;
}

function flattenParams(p: Record<string, string>): DeliveryParams {
  return {
    message_id: p.message_id ?? p.msg_id ?? p.id,
    msg_id: p.msg_id,
    id: p.id,
    status: p.status ?? p.delivery_status ?? p.deliveryStatus,
    delivered: p.delivered ?? p.delivery,
    error: p.error ?? p.error_code ?? p.reason,
    to: p.to ?? p.dst ?? p.destination,
    dst: p.dst,
    did: p.did,
  };
}

// Convert voip.ms-flavored status into our locked event_type. Per contract
// §9 we only emit sms_delivered or sms_failed from this source.
function classifyStatus(d: DeliveryParams): 'sms_delivered' | 'sms_failed' {
  const s = (d.status ?? d.delivered ?? '').toString().toLowerCase();
  // voip.ms uses 'delivered' for success; explicit failure flags are
  // 'failed' / 'undelivered' / 'rejected'. Treat any non-success
  // as failure so we don't silently lose visibility.
  if (s === 'delivered' || s === 'success' || s === '1' || s === 'true') {
    return 'sms_delivered';
  }
  return 'sms_failed';
}

async function logRaw(
  ctx: {
    method: string;
    rawQuery: string;
    rawBody: string | null;
    contentType: string;
    userAgent: string;
  },
  outcome: 'stored' | 'parse_failed' | 'no_lookup',
  parsed: Record<string, string> | null,
  voipmsId: string | null,
  errMsg: string | null,
): Promise<void> {
  try {
    await sql`
      INSERT INTO voip_webhook_log (
        method, source, outcome, raw_query, raw_body, content_type,
        parsed_params, from_phone, to_did, voipms_id, error, user_agent
      ) VALUES (
        ${ctx.method}, 'blast_delivery', ${outcome},
        ${ctx.rawQuery || null}, ${ctx.rawBody}, ${ctx.contentType || null},
        ${parsed ? JSON.stringify(parsed) : null},
        NULL, NULL, ${voipmsId}, ${errMsg}, ${ctx.userAgent || null}
      )
    `;
  } catch (e) {
    console.error('[blast/voipms/webhook] log insert failed:', e);
  }
}

/**
 * Best-effort lookup: find the (blast_id, driver_id) for the affected SMS by
 * scanning sms_log for rows whose voipms_response JSONB contains the message
 * id voip.ms is reporting on. Returns null if we can't pin it down — caller
 * still writes a raw event so the data isn't lost.
 *
 * TODO(stream-b): when sms_log gains a dedicated voipms_message_id indexed
 * column (separate schema PR — outside Gate 2.1 scope), swap this scan for
 * an indexed lookup so this query stays fast at scale.
 */
async function lookupTarget(messageId: string | null | undefined): Promise<{
  blastId: string;
  driverId: string;
} | null> {
  if (!messageId) return null;
  try {
    // sms_log.event_type='blast_notification' is the value lib/blast/notify.ts
    // sets when fanning out; sms_log.user_id is the driver id; sms_log.ride_id
    // is unused for blast (blast_id isn't on sms_log either, so we resolve via
    // the most recent blast_driver_targets row for that driver). This is a
    // narrow, recent window so the heuristic is acceptable for Gate 2.2.
    const rows = await sql`
      SELECT user_id AS driver_id
      FROM sms_log
      WHERE event_type = 'blast_notification'
        AND user_id IS NOT NULL
        AND voipms_response IS NOT NULL
        AND voipms_response::text LIKE ${'%' + messageId + '%'}
      ORDER BY id DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    const driverId = (rows[0] as { driver_id: string }).driver_id;
    // Find the most recent blast this driver was a target of (the SMS would
    // have been the notification for that target row).
    const targetRows = await sql`
      SELECT blast_id
      FROM blast_driver_targets
      WHERE driver_id = ${driverId}
        AND notified_at IS NOT NULL
      ORDER BY notified_at DESC
      LIMIT 1
    `;
    if (targetRows.length === 0) return null;
    return {
      blastId: (targetRows[0] as { blast_id: string }).blast_id,
      driverId,
    };
  } catch (e) {
    console.error('[blast/voipms/webhook] lookupTarget failed:', e);
    return null;
  }
}

async function writeEvent(
  blastId: string,
  driverId: string,
  eventType: 'sms_delivered' | 'sms_failed',
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await sql`
      INSERT INTO blast_driver_events (blast_id, driver_id, event_type, event_data, source)
      VALUES (${blastId}, ${driverId}, ${eventType}, ${JSON.stringify(data)}::jsonb, 'voipms_webhook')
    `;
  } catch (e) {
    console.error('[blast/voipms/webhook] event insert failed:', e);
  }
}

function paramsFromSearch(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => { out[k] = v; });
  return out;
}

function buildContext(req: NextRequest, rawBody: string | null) {
  return {
    method: req.method,
    rawQuery: req.nextUrl.search.replace(/^\?/, ''),
    rawBody,
    contentType: req.headers.get('content-type') ?? '',
    userAgent: req.headers.get('user-agent') ?? '',
  };
}

async function handle(params: Record<string, string>, ctx: ReturnType<typeof buildContext>) {
  const flat = flattenParams(params);
  const eventType = classifyStatus(flat);
  const voipmsMessageId = flat.message_id ?? flat.msg_id ?? flat.id ?? null;

  const target = await lookupTarget(voipmsMessageId);

  if (!target) {
    await logRaw(ctx, 'no_lookup', params, voipmsMessageId, 'message_id did not match any sms_log row');
    return NextResponse.json({ ok: true, matched: false });
  }

  await writeEvent(target.blastId, target.driverId, eventType, {
    voipms_message_id: voipmsMessageId,
    status: flat.status ?? flat.delivered ?? null,
    error: flat.error ?? null,
    raw_payload: params,
  });
  await logRaw(ctx, 'stored', params, voipmsMessageId, null);

  return NextResponse.json({ ok: true, matched: true, eventType });
}

export async function GET(req: NextRequest) {
  // voip.ms is known to send GET callbacks with query params for some accounts.
  const ctx = buildContext(req, null);
  const params = paramsFromSearch(req.nextUrl.searchParams);
  return handle(params, ctx);
}

export async function POST(req: NextRequest) {
  let rawBody: string | null = null;
  try { rawBody = await req.text(); } catch { rawBody = null; }
  const ctx = buildContext(req, rawBody);

  // Query-string variant first
  const qp = paramsFromSearch(req.nextUrl.searchParams);
  if (Object.keys(qp).length > 0) {
    return handle(qp, ctx);
  }

  // Form-encoded
  if (ctx.contentType.includes('form') && rawBody) {
    const formParams: Record<string, string> = {};
    try {
      const usp = new URLSearchParams(rawBody);
      usp.forEach((v, k) => { formParams[k] = v; });
      return handle(formParams, ctx);
    } catch (e) {
      await logRaw(ctx, 'parse_failed', null, null, e instanceof Error ? e.message : 'form parse failed');
      return NextResponse.json({ ok: true, parse: 'form_failed' });
    }
  }

  // JSON
  if (rawBody) {
    try {
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(body)) {
        if (typeof v === 'string' || typeof v === 'number') flat[k] = String(v);
      }
      return handle(flat, ctx);
    } catch (e) {
      await logRaw(ctx, 'parse_failed', null, null, e instanceof Error ? e.message : 'json parse failed');
      return NextResponse.json({ ok: true, parse: 'json_failed' });
    }
  }

  await logRaw(ctx, 'parse_failed', null, null, 'empty body');
  return NextResponse.json({ ok: true, parse: 'empty' });
}
