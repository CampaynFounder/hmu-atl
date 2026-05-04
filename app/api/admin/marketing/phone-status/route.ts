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

  // Normalize on BOTH sides to last-10-digits. Phones are stored inconsistently:
  //   rider_profiles.phone / driver_profiles.phone → E.164 (+14045551234)
  //   sms_log.to_phone / sms_inbound.from_phone   → 10-digit (4045551234)
  //   admin_sms_sent.recipient_phone              → mixed 10/11-digit
  // Use '\\D' in the JS source: in a JS string literal '\D' silently drops the
  // backslash to just 'D' (regex would strip D's, not non-digits). Doubling it
  // sends the literal \D to Postgres so REGEXP_REPLACE actually means non-digit.
  try {
    const [signedUpRows, textedRows] = await Promise.all([
      sql`
        SELECT DISTINCT phone10 FROM (
          SELECT RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) AS phone10
          FROM rider_profiles
          WHERE phone IS NOT NULL
            AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = ANY(${digits})
          UNION
          SELECT RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) AS phone10
          FROM driver_profiles
          WHERE phone IS NOT NULL
            AND RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = ANY(${digits})
        ) s
      `,
      // admin_sms_sent uses sent_at (NOT created_at) — referencing created_at
      // crashed the whole UNION and left every chip stuck on "checking".
      sql`
        SELECT phone10, MAX(last_at) AS last_at FROM (
          SELECT RIGHT(REGEXP_REPLACE(to_phone, '\\D', '', 'g'), 10) AS phone10,
                 MAX(created_at) AS last_at
          FROM sms_log
          WHERE to_phone IS NOT NULL
            AND RIGHT(REGEXP_REPLACE(to_phone, '\\D', '', 'g'), 10) = ANY(${digits})
          GROUP BY 1
          UNION ALL
          SELECT RIGHT(REGEXP_REPLACE(from_phone, '\\D', '', 'g'), 10) AS phone10,
                 MAX(created_at) AS last_at
          FROM sms_inbound
          WHERE from_phone IS NOT NULL
            AND RIGHT(REGEXP_REPLACE(from_phone, '\\D', '', 'g'), 10) = ANY(${digits})
          GROUP BY 1
          UNION ALL
          SELECT RIGHT(REGEXP_REPLACE(recipient_phone, '\\D', '', 'g'), 10) AS phone10,
                 MAX(sent_at) AS last_at
          FROM admin_sms_sent
          WHERE recipient_phone IS NOT NULL
            AND RIGHT(REGEXP_REPLACE(recipient_phone, '\\D', '', 'g'), 10) = ANY(${digits})
          GROUP BY 1
        ) t
        GROUP BY phone10
      `,
    ]);

    return NextResponse.json({
      signedUp: (signedUpRows as { phone10: string }[]).map((r) => r.phone10),
      texted: (textedRows as { phone10: string; last_at: string }[]).map((r) => ({
        phone: r.phone10,
        lastAt: r.last_at,
      })),
    });
  } catch (err) {
    // Surface SQL errors to the client + worker logs. Without this, a thrown
    // sql() error becomes a generic 500 with no body, the frontend bails on
    // !res.ok, and chips stay on "checking" forever with nothing to debug.
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[phone-status] query failed:', detail, err);
    return NextResponse.json({ error: 'phone-status query failed', detail }, { status: 500 });
  }
}
