// Admin push tool — send a marketing/announcement notification to ONE user.
//
// GET  ?userId=<neon users.id>  → device status ({ hasPushToken, pushPlatform, name })
//                                  so the UI can warn "in-app only, no device".
// POST { userId, title, body, route?, sendPush?, sendInApp? }
//                                  → fires the OS push and/or in-app banner.
//
// Reuses the existing send primitives (notifyUser + sendPushToUser). The two
// legs are independent and best-effort — in-app (Ably) delivery works even
// with no registered device token; only the OS push needs one. Every send is
// written to admin_audit_log. userId is the Neon users.id (NOT the Clerk id) —
// that is the channel key the mobile app subscribes to.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, hasPermission, logAdminAction } from '@/lib/admin/helpers';
import { notifyUser } from '@/lib/ably/server';
import { sendPushToUser } from '@/lib/push/send';
import { sql } from '@/lib/db/client';

const TITLE_MAX = 100;
const BODY_MAX = 240;

// Resolve a display name for a Neon user id from either profile table.
async function lookupUser(userId: string): Promise<{
  exists: boolean;
  name: string | null;
  hasPushToken: boolean;
  pushPlatform: string | null;
} | null> {
  const rows = await sql`
    SELECT u.push_token, u.push_platform,
           COALESCE(dp.display_name, dp.handle, rp.display_name, rp.handle) AS name
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  if (!rows.length) return { exists: false, name: null, hasPushToken: false, pushPlatform: null };
  const r = rows[0] as Record<string, unknown>;
  return {
    exists: true,
    name: (r.name as string) ?? null,
    hasPushToken: !!r.push_token,
    pushPlatform: (r.push_platform as string) ?? null,
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.notifications.view')) return unauthorizedResponse();

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const info = await lookupUser(userId);
  if (!info || !info.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({
    name: info.name,
    hasPushToken: info.hasPushToken,
    pushPlatform: info.pushPlatform,
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.notifications.edit')) return unauthorizedResponse();

  try {
    const { userId, title, body, route, sendPush = true, sendInApp = true } = await req.json() as {
      userId?: string;
      title?: string;
      body?: string;
      route?: string;
      sendPush?: boolean;
      sendInApp?: boolean;
    };

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    const cleanTitle = title?.trim() ?? '';
    const cleanBody = body?.trim() ?? '';
    if (!cleanTitle) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!cleanBody) return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    if (cleanTitle.length > TITLE_MAX) {
      return NextResponse.json({ error: `Title is ${cleanTitle.length} chars (max ${TITLE_MAX})` }, { status: 400 });
    }
    if (cleanBody.length > BODY_MAX) {
      return NextResponse.json({ error: `Message is ${cleanBody.length} chars (max ${BODY_MAX})` }, { status: 400 });
    }
    if (!sendPush && !sendInApp) {
      return NextResponse.json({ error: 'Enable at least one channel (push or in-app)' }, { status: 400 });
    }

    const info = await lookupUser(userId);
    if (!info || !info.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const cleanRoute = route?.trim() || null;
    const data = { type: 'marketing', title: cleanTitle, body: cleanBody, route: cleanRoute };

    // Both legs are best-effort and independent — a failure in one must not
    // abort the other. We report exactly what actually went out.
    let inAppSent = false;
    let pushSent = false;

    if (sendInApp) {
      try {
        await notifyUser(userId, 'marketing', data);
        inAppSent = true;
      } catch (e) {
        console.error('[admin/push] in-app leg failed:', e);
      }
    }

    if (sendPush && info.hasPushToken) {
      try {
        await sendPushToUser(userId, {
          title: cleanTitle,
          body: cleanBody,
          data: { type: 'marketing', route: cleanRoute },
        });
        pushSent = true;
      } catch (e) {
        console.error('[admin/push] push leg failed:', e);
      }
    }

    await logAdminAction(admin.id, 'admin_push', 'user', userId, {
      title: cleanTitle,
      bodyPreview: cleanBody.slice(0, 80),
      route: cleanRoute,
      requestedPush: sendPush,
      requestedInApp: sendInApp,
      hadPushToken: info.hasPushToken,
      inAppSent,
      pushSent,
    });

    return NextResponse.json({
      ok: true,
      inAppSent,
      pushSent,
      hadPushToken: info.hasPushToken,
      // Surface a soft warning when the admin wanted a push but no device is registered.
      pushSkippedNoDevice: sendPush && !info.hasPushToken,
    });
  } catch (error) {
    console.error('Admin push error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
