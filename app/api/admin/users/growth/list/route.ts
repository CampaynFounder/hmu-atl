// GET /api/admin/users/growth/list?bucket=<riders|drivers|active|pending|other>&period=<daily|weekly|monthly>
//
// Drill-in data for the Growth tab's stat cards. Returns user rows scoped to
// the chart's current time window (period → start of day/week/month) joined
// with the admin_sms_sent audit log.
//
// Sort: never-texted first, then by sign-up date ASC — so untexted holdouts
// float to the top of the outreach list.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { getAdminSmsLastSent } from '@/lib/admin/sms';

type Bucket = 'riders' | 'drivers' | 'active' | 'pending' | 'other';
type Period = 'daily' | 'weekly' | 'monthly';

function windowStartISO(period: Period): string {
  const now = new Date();
  if (period === 'daily') {
    now.setHours(0, 0, 0, 0);
  } else if (period === 'weekly') {
    const day = now.getDay(); // 0 = Sun
    now.setDate(now.getDate() - day);
    now.setHours(0, 0, 0, 0);
  } else {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const bucket = (searchParams.get('bucket') || 'riders') as Bucket;
  const period = (searchParams.get('period') || 'daily') as Period;

  if (!['riders', 'drivers', 'active', 'pending', 'other'].includes(bucket)) {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 });
  }
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
  }

  const fromIso = windowStartISO(period);

  // One query per bucket — keeps SQL explicit and avoids fragment composition.
  let rows: Array<Record<string, unknown>>;
  switch (bucket) {
    case 'riders':
      rows = await sql`
        SELECT
          u.id, u.profile_type, u.signup_source, u.referred_by_driver_id, u.created_at, u.completed_rides,
          rp.display_name, rp.phone,
          ref.display_name AS referring_driver_name,
          ref.handle AS referring_driver_handle
        FROM users u
        JOIN rider_profiles rp ON rp.user_id = u.id
        LEFT JOIN driver_profiles ref ON ref.user_id = u.referred_by_driver_id
        WHERE u.profile_type = 'rider'
          AND u.is_admin = false
          AND u.created_at >= ${fromIso}
        ORDER BY u.created_at DESC
        LIMIT 500
      ` as Array<Record<string, unknown>>;
      break;
    case 'drivers':
      rows = await sql`
        SELECT
          u.id, u.profile_type, u.signup_source, u.referred_by_driver_id, u.created_at, u.completed_rides,
          dp.display_name, dp.phone,
          NULL::text AS referring_driver_name,
          NULL::text AS referring_driver_handle
        FROM users u
        JOIN driver_profiles dp ON dp.user_id = u.id
        WHERE u.profile_type = 'driver'
          AND u.is_admin = false
          AND u.created_at >= ${fromIso}
        ORDER BY u.created_at DESC
        LIMIT 500
      ` as Array<Record<string, unknown>>;
      break;
    case 'active':
      rows = await sql`
        SELECT
          u.id, u.profile_type, u.signup_source, u.referred_by_driver_id, u.created_at, u.completed_rides,
          COALESCE(rp.display_name, dp.display_name) AS display_name,
          COALESCE(rp.phone, dp.phone) AS phone,
          ref.display_name AS referring_driver_name,
          ref.handle AS referring_driver_handle
        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN driver_profiles ref ON ref.user_id = u.referred_by_driver_id
        WHERE u.account_status = 'active'
          AND u.is_admin = false
          AND u.created_at >= ${fromIso}
        ORDER BY u.created_at DESC
        LIMIT 500
      ` as Array<Record<string, unknown>>;
      break;
    case 'pending':
      rows = await sql`
        SELECT
          u.id, u.profile_type, u.signup_source, u.referred_by_driver_id, u.created_at, u.completed_rides,
          COALESCE(rp.display_name, dp.display_name) AS display_name,
          COALESCE(rp.phone, dp.phone) AS phone,
          ref.display_name AS referring_driver_name,
          ref.handle AS referring_driver_handle
        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN driver_profiles ref ON ref.user_id = u.referred_by_driver_id
        WHERE u.account_status = 'pending_activation'
          AND u.is_admin = false
          AND u.created_at >= ${fromIso}
        ORDER BY u.created_at DESC
        LIMIT 500
      ` as Array<Record<string, unknown>>;
      break;
    case 'other':
      rows = await sql`
        SELECT
          u.id, u.profile_type, u.signup_source, u.referred_by_driver_id, u.created_at, u.completed_rides,
          NULL::text AS display_name,
          NULL::text AS phone,
          NULL::text AS referring_driver_name,
          NULL::text AS referring_driver_handle
        FROM users u
        WHERE u.profile_type NOT IN ('rider', 'driver')
          AND u.is_admin = false
          AND u.created_at >= ${fromIso}
        ORDER BY u.created_at DESC
        LIMIT 500
      ` as Array<Record<string, unknown>>;
      break;
  }

  const ids = rows.map((r) => String(r.id));
  const lastSentMap = await getAdminSmsLastSent(ids);

  // Build response, then sort: never-texted first, then by signed_up_at ASC
  // so untexted outreach holdouts float to the top of the list.
  const users = rows.map((r) => {
    const info = lastSentMap.get(String(r.id));
    return {
      id: String(r.id),
      profileType: String(r.profile_type) as 'rider' | 'driver',
      displayName: (r.display_name as string | null) || '—',
      phone: (r.phone as string | null) || null,
      signupSource: (r.signup_source as string | null) || null,
      referringDriver: r.referred_by_driver_id
        ? {
            name: (r.referring_driver_name as string | null) || null,
            handle: (r.referring_driver_handle as string | null) || null,
          }
        : null,
      signedUpAt: new Date(r.created_at as string).toISOString(),
      completedRides: Number(r.completed_rides ?? 0),
      lastTextedAt: info?.lastSentAt?.toISOString() || null,
      textedCount: info?.count || 0,
    };
  });

  users.sort((a, b) => {
    if (a.lastTextedAt === null && b.lastTextedAt !== null) return -1;
    if (a.lastTextedAt !== null && b.lastTextedAt === null) return 1;
    return a.signedUpAt.localeCompare(b.signedUpAt);
  });

  return NextResponse.json({
    bucket,
    period,
    fromIso,
    users,
  });
}
