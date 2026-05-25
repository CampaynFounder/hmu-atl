// GET /api/admin/voip-debug — recent voip webhook hits + recent voip API responses
//
// Surface for troubleshooting:
//  - inbound: every voip.ms webhook call (incl. pings, parse failures)
//  - outbound: recent sms_log rows with full voipms_response payload
//
// Both lists are admin-global; sms_log can be optionally market-scoped.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

async function resolveMarketSlug(marketId: string | null): Promise<string | null> {
  if (!marketId) return null;
  const rows = await sql`SELECT slug FROM markets WHERE id = ${marketId} LIMIT 1`;
  return (rows[0] as { slug?: string } | undefined)?.slug || null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.voip.view')) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const outcome = searchParams.get('outcome'); // 'stored' | 'ping' | 'missing_fields' | 'parse_failed'
  const phone = searchParams.get('phone');
  const marketSlug = await resolveMarketSlug(searchParams.get('marketId'));

  // ── Inbound webhook log ──
  const phoneDigits = phone ? phone.replace(/\D/g, '') : null;
  let inbound;
  if (outcome && phoneDigits) {
    inbound = await sql`
      SELECT id, method, source, outcome, raw_query, raw_body, content_type,
             parsed_params, from_phone, to_did, voipms_id, error, user_agent, created_at
      FROM voip_webhook_log
      WHERE outcome = ${outcome} AND from_phone LIKE ${'%' + phoneDigits}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
  } else if (outcome) {
    inbound = await sql`
      SELECT id, method, source, outcome, raw_query, raw_body, content_type,
             parsed_params, from_phone, to_did, voipms_id, error, user_agent, created_at
      FROM voip_webhook_log
      WHERE outcome = ${outcome}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
  } else if (phoneDigits) {
    inbound = await sql`
      SELECT id, method, source, outcome, raw_query, raw_body, content_type,
             parsed_params, from_phone, to_did, voipms_id, error, user_agent, created_at
      FROM voip_webhook_log
      WHERE from_phone LIKE ${'%' + phoneDigits}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
  } else {
    inbound = await sql`
      SELECT id, method, source, outcome, raw_query, raw_body, content_type,
             parsed_params, from_phone, to_did, voipms_id, error, user_agent, created_at
      FROM voip_webhook_log
      ORDER BY created_at DESC LIMIT ${limit}
    `;
  }

  // ── Outbound voip.ms API responses (recent + recent failed) ──
  const outboundLimit = Math.min(limit, 100);
  const outbound = marketSlug
    ? await sql`
        SELECT id, to_phone, from_did, message, status, voipms_status, voipms_http_status,
               voipms_response, error, retry_count, event_type, created_at
        FROM sms_log
        WHERE market = ${marketSlug}
        ORDER BY created_at DESC LIMIT ${outboundLimit}
      `
    : await sql`
        SELECT id, to_phone, from_did, message, status, voipms_status, voipms_http_status,
               voipms_response, error, retry_count, event_type, created_at
        FROM sms_log
        ORDER BY created_at DESC LIMIT ${outboundLimit}
      `;

  // ── Counts (last 24h) for the header ──
  const counts = await sql`
    SELECT outcome, COUNT(*) as count
    FROM voip_webhook_log
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY outcome
  `;
  const countMap: Record<string, number> = {};
  for (const r of counts as { outcome: string; count: string }[]) {
    countMap[r.outcome] = Number(r.count);
  }

  return NextResponse.json({
    inbound: (inbound as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      method: r.method,
      source: r.source,
      outcome: r.outcome,
      rawQuery: r.raw_query,
      rawBody: r.raw_body,
      contentType: r.content_type,
      parsedParams: r.parsed_params,
      fromPhone: r.from_phone,
      toDid: r.to_did,
      voipmsId: r.voipms_id,
      error: r.error,
      userAgent: r.user_agent,
      createdAt: r.created_at,
    })),
    outbound: (outbound as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      toPhone: r.to_phone,
      fromDid: r.from_did,
      message: r.message,
      status: r.status,
      voipmsStatus: r.voipms_status,
      voipmsHttpStatus: r.voipms_http_status,
      voipmsResponse: r.voipms_response,
      error: r.error,
      retryCount: r.retry_count,
      eventType: r.event_type,
      createdAt: r.created_at,
    })),
    counts24h: {
      stored: countMap.stored || 0,
      ping: countMap.ping || 0,
      missingFields: countMap.missing_fields || 0,
      parseFailed: countMap.parse_failed || 0,
      total: Object.values(countMap).reduce((a, b) => a + b, 0),
    },
  });
}
