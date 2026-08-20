// Admin broadcast push — send an announcement to MANY users: a set of specific
// users, or a whole segment (everyone / all drivers / all riders, optionally
// scoped to a market).
//
// GET  ?role=all|driver|rider&market=<slug>          → recipient counts (preview)
//      ?userIds=id,id,id                              → counts for a specific set
// POST { title, body, route?, sendPush, sendInApp, target }
//        target = { type:'users', userIds:[] } | { type:'segment', role, marketSlug? }
//
// Push goes out in Expo batches of 100 via ctx.waitUntil so the request returns
// immediately even for a large install base. Every broadcast is audit-logged.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, hasPermission, logAdminAction } from '@/lib/admin/helpers';
import { notifyUser } from '@/lib/ably/server';
import { sendPushBulk } from '@/lib/push/send';
import { deferPush } from '@/lib/notify';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TITLE_MAX = 100;
const BODY_MAX = 240;

type Role = 'all' | 'driver' | 'rider';

interface Recipient { id: string; push_token: string | null }

// Resolve the recipient set. Excludes deleted + seed accounts. For a segment,
// optionally scope to a market slug.
async function resolveRecipients(target:
  | { type: 'users'; userIds: string[] }
  | { type: 'segment'; role: Role; marketSlug?: string | null },
): Promise<Recipient[]> {
  if (target.type === 'users') {
    const ids = target.userIds.filter((s) => typeof s === 'string' && s.length > 0);
    if (!ids.length) return [];
    const rows = await sql`
      SELECT id, push_token FROM users
      WHERE id = ANY(${ids}::uuid[]) AND account_status <> 'deleted' AND is_seed = false
    `;
    return rows as Recipient[];
  }
  const role = target.role;
  const marketSlug = target.marketSlug ?? null;
  const rows = await sql`
    SELECT u.id, u.push_token
    FROM users u
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.account_status = 'active'
      AND u.is_seed = false
      AND (${role}::text = 'all' OR u.profile_type = ${role})
      AND (${marketSlug}::text IS NULL OR m.slug = ${marketSlug})
  `;
  return rows as Recipient[];
}

function parseTarget(req: NextRequest):
  | { type: 'users'; userIds: string[] }
  | { type: 'segment'; role: Role; marketSlug?: string | null } {
  const userIdsParam = req.nextUrl.searchParams.get('userIds');
  if (userIdsParam) {
    return { type: 'users', userIds: userIdsParam.split(',').map((s) => s.trim()).filter(Boolean) };
  }
  const roleRaw = req.nextUrl.searchParams.get('role');
  const role: Role = roleRaw === 'driver' || roleRaw === 'rider' ? roleRaw : 'all';
  return { type: 'segment', role, marketSlug: req.nextUrl.searchParams.get('market') };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.notifications.view')) return unauthorizedResponse();

  const recipients = await resolveRecipients(parseTarget(req));
  const withToken = recipients.filter((r) => !!r.push_token).length;
  return NextResponse.json({ total: recipients.length, withPushToken: withToken });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'act.notifications.edit')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    title?: string; body?: string; route?: string;
    sendPush?: boolean; sendInApp?: boolean;
    target?: { type: 'users'; userIds: string[] } | { type: 'segment'; role: Role; marketSlug?: string | null };
  };

  const title = (body.title ?? '').trim();
  const message = (body.body ?? '').trim();
  const cleanRoute = body.route?.trim() || null;
  const sendPush = body.sendPush !== false;
  const sendInApp = body.sendInApp !== false;

  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  if (!message) return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
  if (title.length > TITLE_MAX) return NextResponse.json({ error: `Title max ${TITLE_MAX} chars` }, { status: 400 });
  if (message.length > BODY_MAX) return NextResponse.json({ error: `Message max ${BODY_MAX} chars` }, { status: 400 });
  if (!sendPush && !sendInApp) return NextResponse.json({ error: 'Enable at least one channel' }, { status: 400 });
  if (!body.target) return NextResponse.json({ error: 'target required' }, { status: 400 });

  const recipients = await resolveRecipients(body.target);
  if (!recipients.length) return NextResponse.json({ error: 'No matching recipients' }, { status: 400 });

  const tokens = recipients.map((r) => r.push_token).filter((t): t is string => !!t);
  const data = { type: 'marketing', title, body: message, route: cleanRoute };

  // Fire the whole broadcast in the background so the request returns fast even
  // for the full install base. waitUntil keeps the isolate alive until it's done.
  deferPush((async () => {
    if (sendPush && tokens.length) {
      await sendPushBulk(tokens, { title, body: message, data: { type: 'marketing', route: cleanRoute } });
    }
    if (sendInApp) {
      // In-app (Ably) reaches even token-less users; best-effort per user.
      for (const r of recipients) {
        await notifyUser(r.id, 'marketing', data).catch(() => {});
      }
    }
  })());

  await logAdminAction(admin.id, 'admin_push_broadcast', 'segment', undefined, {
    title, bodyPreview: message.slice(0, 80), route: cleanRoute,
    target: body.target, recipients: recipients.length, withPushToken: tokens.length,
    sendPush, sendInApp,
  });

  return NextResponse.json({ ok: true, recipients: recipients.length, withPushToken: tokens.length });
}
