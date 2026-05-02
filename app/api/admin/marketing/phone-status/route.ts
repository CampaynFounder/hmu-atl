// POST /api/admin/marketing/phone-status — bulk classify phone numbers for the
// outreach composer's red/yellow/green chip strip.
//
// Body: { phones: string[] }   — any format; normalized to digits server-side
// Returns: {
//   signedUp: string[],                          // digits-only, in rider/driver profiles
//   texted:   { phone: string, lastAt: string }[] // digits-only, last sms_log/sms_inbound/admin_sms_sent timestamp
// }
//
// Frontend rule: signedUp wins over texted; everything else is "never touched".

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

  const digits = Array.from(
    new Set(
      phones
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.replace(/\D/g, ''))
        .filter((p) => p.length >= 10),
    ),
  ).slice(0, 500);

  if (digits.length === 0) {
    return NextResponse.json({ signedUp: [], texted: [] });
  }

  const [signedUpRows, textedRows] = await Promise.all([
    sql`
      SELECT DISTINCT phone FROM (
        SELECT phone FROM rider_profiles WHERE phone = ANY(${digits})
        UNION
        SELECT phone FROM driver_profiles WHERE phone = ANY(${digits})
      ) s
    `,
    sql`
      SELECT phone, MAX(last_at) AS last_at FROM (
        SELECT to_phone        AS phone, MAX(created_at) AS last_at FROM sms_log         WHERE to_phone        = ANY(${digits}) GROUP BY to_phone
        UNION ALL
        SELECT from_phone      AS phone, MAX(created_at) AS last_at FROM sms_inbound     WHERE from_phone      = ANY(${digits}) GROUP BY from_phone
        UNION ALL
        SELECT recipient_phone AS phone, MAX(created_at) AS last_at FROM admin_sms_sent  WHERE recipient_phone = ANY(${digits}) GROUP BY recipient_phone
      ) t
      GROUP BY phone
    `,
  ]);

  return NextResponse.json({
    signedUp: (signedUpRows as { phone: string }[]).map((r) => r.phone),
    texted: (textedRows as { phone: string; last_at: string }[]).map((r) => ({
      phone: r.phone,
      lastAt: r.last_at,
    })),
  });
}
