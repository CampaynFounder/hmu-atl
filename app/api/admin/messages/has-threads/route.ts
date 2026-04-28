// POST /api/admin/messages/has-threads — bulk check which phones already
// have SMS history. Used by /admin/marketing's RecentSignups to pre-tag
// rows where the Thread button will deep-link to an existing conversation
// vs starting a fresh compose.
//
// Body: { phones: string[] }   — any format; normalized to digits server-side
// Returns: { withThreads: string[] }  — input phones (digits-only) that
//          appear in sms_log.to_phone or sms_inbound.from_phone

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const phones = (body as { phones?: unknown })?.phones;
  if (!Array.isArray(phones)) {
    return NextResponse.json({ error: 'phones must be an array' }, { status: 400 });
  }

  // Normalize to digits so the lookup matches sms_log/sms_inbound's stored
  // format. Cap input size as a safety rail; the call sites only ever send
  // a few dozen at a time.
  const digits = Array.from(
    new Set(
      phones
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.replace(/\D/g, ''))
        .filter(Boolean),
    ),
  ).slice(0, 500);

  if (digits.length === 0) {
    return NextResponse.json({ withThreads: [] });
  }

  const rows = await sql`
    SELECT DISTINCT phone FROM (
      SELECT to_phone as phone FROM sms_log WHERE to_phone = ANY(${digits})
      UNION
      SELECT from_phone as phone FROM sms_inbound WHERE from_phone = ANY(${digits})
    ) t
  `;

  return NextResponse.json({
    withThreads: (rows as { phone: string }[]).map((r) => r.phone),
  });
}
