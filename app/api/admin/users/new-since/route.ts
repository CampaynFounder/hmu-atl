// Live Ops "new users since I last checked" counter + drill-in.
//
// GET  — returns counts split by completed (profile row exists) vs incomplete (no profile row).
//         Uses per-admin users.admin_last_seen_at cursor; first-time admins get a 24h window.
// POST — drill-in action. Returns the full list of users in the requested bucket AND
//         resets admin_last_seen_at = NOW() so the counter goes to 0. This is called when
//         the admin clicks a stat card to open the fly-in sheet.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { getAdminSmsLastSent } from '@/lib/admin/sms';

const TWENTY_FOUR_HOURS_AGO = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

async function getCursor(adminId: string): Promise<string> {
  const rows = await sql`SELECT admin_last_seen_at FROM users WHERE id = ${adminId} LIMIT 1`;
  const raw = rows[0]?.admin_last_seen_at as string | null | undefined;
  return raw || TWENTY_FOUR_HOURS_AGO();
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const cursor = await getCursor(admin.id);

  // Two separate queries so the counts match the POST drill-in semantics:
  // - new_users counts are cursor-scoped ("since last visit")
  // - incomplete counts are all-time (outreach queue — stays relevant until contacted)
  const [newUsersRow] = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE u.profile_type = 'rider'
          AND EXISTS (SELECT 1 FROM rider_profiles rp WHERE rp.user_id = u.id)
      )::int AS new_riders,
      COUNT(*) FILTER (
        WHERE u.profile_type = 'driver'
          AND EXISTS (SELECT 1 FROM driver_profiles dp WHERE dp.user_id = u.id)
      )::int AS new_drivers
    FROM users u
    WHERE u.created_at > ${cursor}
      AND u.is_admin = false
  `;

  const [incompleteRow] = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE u.profile_type = 'rider'
          AND NOT EXISTS (SELECT 1 FROM rider_profiles rp WHERE rp.user_id = u.id)
      )::int AS incomplete_riders,
      COUNT(*) FILTER (
        WHERE u.profile_type = 'driver'
          AND NOT EXISTS (SELECT 1 FROM driver_profiles dp WHERE dp.user_id = u.id)
      )::int AS incomplete_drivers
    FROM users u
    WHERE u.is_admin = false
  `;

  const r = {
    new_riders: (newUsersRow as { new_riders: number }).new_riders,
    new_drivers: (newUsersRow as { new_drivers: number }).new_drivers,
    incomplete_riders: (incompleteRow as { incomplete_riders: number }).incomplete_riders,
    incomplete_drivers: (incompleteRow as { incomplete_drivers: number }).incomplete_drivers,
  };

  return NextResponse.json({
    lastSeenAt: cursor,
    newUsers: {
      riders: r.new_riders,
      drivers: r.new_drivers,
      total: r.new_riders + r.new_drivers,
    },
    incomplete: {
      riders: r.incomplete_riders,
      drivers: r.incomplete_drivers,
      total: r.incomplete_riders + r.incomplete_drivers,
    },
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json().catch(() => ({}));
  const bucket = body.bucket as 'new_users' | 'incomplete';
  if (bucket !== 'new_users' && bucket !== 'incomplete') {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 });
  }

  const cursor = await getCursor(admin.id);

  // Two branches — avoid sql fragment composition (not supported by the tag).
  // new_users = cursor-gated AND has a profile row.
  // incomplete = all-time AND has no profile row (outreach queue).
  const rows = bucket === 'new_users'
    ? await sql`
        SELECT
          u.id, u.profile_type, u.signup_source, u.referred_by_driver_id, u.created_at,
          COALESCE(rp.display_name, dp.display_name) AS display_name,
          COALESCE(rp.phone, dp.phone) AS phone,
          u.completed_rides,
          ref.display_name AS referring_driver_name,
          ref.handle AS referring_driver_handle
        FROM users u
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN driver_profiles ref ON ref.user_id = u.referred_by_driver_id
        WHERE u.is_admin = false
          AND u.created_at > ${cursor}
          AND (rp.user_id IS NOT NULL OR dp.user_id IS NOT NULL)
        ORDER BY u.created_at DESC
        LIMIT 500
      `
    : await sql`
        SELECT
          u.id, u.profile_type, u.signup_source, u.referred_by_driver_id, u.created_at,
          NULL::text AS display_name,
          NULL::text AS phone,
          u.completed_rides,
          ref.display_name AS referring_driver_name,
          ref.handle AS referring_driver_handle
        FROM users u
        LEFT JOIN driver_profiles ref ON ref.user_id = u.referred_by_driver_id
        WHERE u.is_admin = false
          AND NOT EXISTS (SELECT 1 FROM rider_profiles rp WHERE rp.user_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM driver_profiles dp WHERE dp.user_id = u.id)
        ORDER BY u.created_at ASC
        LIMIT 500
      `;

  const list = rows as Array<{
    id: string;
    profile_type: string;
    signup_source: string | null;
    referred_by_driver_id: string | null;
    created_at: string;
    display_name: string | null;
    phone: string | null;
    completed_rides: number;
    referring_driver_name: string | null;
    referring_driver_handle: string | null;
  }>;

  const lastSentMap = await getAdminSmsLastSent(list.map((u) => u.id));

  // Reset cursor only for the new_users bucket — incomplete is an outreach queue,
  // not a "since last visit" counter.
  if (bucket === 'new_users') {
    await sql`UPDATE users SET admin_last_seen_at = NOW() WHERE id = ${admin.id}`;
  }

  return NextResponse.json({
    bucket,
    users: list.map((u) => {
      const info = lastSentMap.get(u.id);
      return {
        id: u.id,
        profileType: u.profile_type,
        displayName: u.display_name || '—',
        phone: u.phone,
        signupSource: u.signup_source,
        referringDriver: u.referred_by_driver_id
          ? { name: u.referring_driver_name, handle: u.referring_driver_handle }
          : null,
        signedUpAt: u.created_at,
        completedRides: u.completed_rides ?? 0,
        lastTextedAt: info?.lastSentAt?.toISOString() || null,
        textedCount: info?.count || 0,
      };
    }),
  });
}
