// GET /api/admin/messages — Message threads (conversations grouped by phone)
// GET /api/admin/messages?phone=4045551234 — Single conversation
// PATCH /api/admin/messages — Mark messages as read
//
// Market scoping: sms_log has a `market` text column (slug). Caller passes
// marketId; we resolve to slug once. sms_inbound has no market column — it's
// raw incoming text intake — so inbound remains admin-global (acceptable
// trade-off: outbound sends are market-scoped, inbound replies are shown to
// any admin who happens to be viewing that thread).
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { publishAdminEvent } from '@/lib/ably/server';

async function resolveMarketSlug(marketId: string | null): Promise<string | null> {
  if (!marketId) return null;
  const rows = await sql`SELECT slug FROM markets WHERE id = ${marketId} LIMIT 1`;
  return (rows[0] as { slug?: string } | undefined)?.slug || null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const phone = searchParams.get('phone');
  const filter = searchParams.get('filter'); // 'inbound', 'outbound', 'failed'
  const marketSlug = await resolveMarketSlug(searchParams.get('marketId'));

  // Drill-down: return filtered message list
  if (filter) {
    let rows;
    if (filter === 'inbound') {
      // sms_inbound has no market column — always admin-global.
      rows = await sql`
        SELECT id, from_phone as phone, message, created_at, 'inbound' as direction,
          NULL as event_type, NULL as status
        FROM sms_inbound ORDER BY created_at DESC LIMIT 100
      `;
    } else if (filter === 'failed') {
      rows = marketSlug
        ? await sql`
            SELECT id, to_phone as phone, message, event_type, status, error, created_at,
              'outbound' as direction
            FROM sms_log WHERE status = 'failed' AND market = ${marketSlug}
            ORDER BY created_at DESC LIMIT 100
          `
        : await sql`
            SELECT id, to_phone as phone, message, event_type, status, error, created_at,
              'outbound' as direction
            FROM sms_log WHERE status = 'failed' ORDER BY created_at DESC LIMIT 100
          `;
    } else {
      rows = marketSlug
        ? await sql`
            SELECT id, to_phone as phone, message, event_type, status, created_at,
              'outbound' as direction
            FROM sms_log WHERE status = 'sent' AND market = ${marketSlug}
            ORDER BY created_at DESC LIMIT 100
          `
        : await sql`
            SELECT id, to_phone as phone, message, event_type, status, created_at,
              'outbound' as direction
            FROM sms_log WHERE status = 'sent' ORDER BY created_at DESC LIMIT 100
          `;
    }
    return NextResponse.json({
      filter,
      messages: rows.map((m: Record<string, unknown>) => ({
        id: m.id,
        phone: m.phone,
        message: m.message,
        direction: m.direction,
        eventType: m.event_type ?? null,
        status: m.status ?? null,
        error: m.error ?? null,
        createdAt: m.created_at,
      })),
    });
  }

  if (phone) {
    // Single conversation — merge outbound + inbound, sorted by time
    const normalized = phone.replace(/\D/g, '');

    const [outbound, inbound] = await Promise.all([
      sql`
        SELECT id, to_phone as phone, message, event_type, status, created_at,
          'outbound' as direction
        FROM sms_log
        WHERE to_phone = ${normalized}
        ORDER BY created_at DESC
        LIMIT 50
      `,
      sql`
        SELECT id, from_phone as phone, message, voipms_id, read, created_at,
          'inbound' as direction
        FROM sms_inbound
        WHERE from_phone = ${normalized}
        ORDER BY created_at DESC
        LIMIT 50
      `,
    ]);

    // Mark inbound as read
    const updated = await sql`
      UPDATE sms_inbound SET read = true
      WHERE from_phone = ${normalized} AND read = false
      RETURNING id
    ` as { id: string }[];
    if (updated.length > 0) {
      publishAdminEvent('message_read', { phone: normalized, count: updated.length }).catch(() => {});
    }

    // Merge and sort
    const messages = [
      ...outbound.map((m: Record<string, unknown>) => ({
        id: m.id,
        direction: 'outbound',
        message: m.message,
        eventType: m.event_type,
        status: m.status,
        createdAt: m.created_at,
      })),
      ...inbound.map((m: Record<string, unknown>) => ({
        id: m.id,
        direction: 'inbound',
        message: m.message,
        read: m.read,
        createdAt: m.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

    // Get user info for this phone
    const userRows = await sql`
      SELECT u.id, u.profile_type,
        COALESCE(dp.display_name, dp.first_name) as name
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE dp.phone = ${normalized} OR dp.phone = ${'+1' + normalized}
      LIMIT 1
    `;

    return NextResponse.json({
      phone: normalized,
      userName: userRows[0]?.name ?? null,
      userType: userRows[0]?.profile_type ?? null,
      userId: userRows[0]?.id ?? null,
      messages,
    });
  }

  // SMS cost stats — outbound is market-scoped; inbound is admin-global.
  const costRows = marketSlug
    ? await sql`
        SELECT
          (SELECT COUNT(*) FROM sms_log WHERE status = 'sent' AND market = ${marketSlug}) as outbound_sms,
          (SELECT COUNT(*) FROM sms_inbound) as inbound_sms,
          (SELECT COUNT(*) FROM sms_log WHERE status = 'failed' AND market = ${marketSlug}) as failed_sms
      `
    : await sql`
        SELECT
          (SELECT COUNT(*) FROM sms_log WHERE status = 'sent') as outbound_sms,
          (SELECT COUNT(*) FROM sms_inbound) as inbound_sms,
          (SELECT COUNT(*) FROM sms_log WHERE status = 'failed') as failed_sms
      `;
  const stats = costRows[0] as Record<string, unknown>;
  const outboundCount = Number(stats.outbound_sms || 0);
  const inboundCount = Number(stats.inbound_sms || 0);
  const failedCount = Number(stats.failed_sms || 0);
  const totalMessages = outboundCount + inboundCount;
  const smsCost = (outboundCount + inboundCount) * 0.0075;

  // Per event type breakdown
  const eventBreakdown = marketSlug
    ? await sql`
        SELECT event_type, COUNT(*) as count
        FROM sms_log WHERE status = 'sent' AND market = ${marketSlug}
        GROUP BY event_type ORDER BY count DESC
      `
    : await sql`
        SELECT event_type, COUNT(*) as count
        FROM sms_log WHERE status = 'sent'
        GROUP BY event_type ORDER BY count DESC
      `;

  // Thread list — grouped by phone number with latest message and unread count.
  // sms_log is market-scoped; sms_inbound is admin-global (threads may include
  // inbound replies from phones we haven't texted from this market).
  const threads = marketSlug
    ? await sql`
        WITH all_messages AS (
          SELECT to_phone as phone, message, created_at, 'outbound' as direction, false as unread
          FROM sms_log WHERE market = ${marketSlug}
          UNION ALL
          SELECT from_phone as phone, message, created_at, 'inbound' as direction, NOT read as unread
          FROM sms_inbound
        ),
        latest AS (
          SELECT phone,
            MAX(created_at) as last_message_at,
            COUNT(*) FILTER (WHERE unread) as unread_count
          FROM all_messages
          GROUP BY phone
        )
        SELECT
          l.phone, l.last_message_at, l.unread_count,
          COALESCE(dp.display_name, dp.first_name) as name,
          u.profile_type
        FROM latest l
        LEFT JOIN driver_profiles dp ON (dp.phone = l.phone OR dp.phone = '+1' || l.phone)
        LEFT JOIN users u ON u.id = dp.user_id
        ORDER BY l.unread_count DESC, l.last_message_at DESC
        LIMIT 50
      `
    : await sql`
        WITH all_messages AS (
          SELECT to_phone as phone, message, created_at, 'outbound' as direction, false as unread
          FROM sms_log
          UNION ALL
          SELECT from_phone as phone, message, created_at, 'inbound' as direction, NOT read as unread
          FROM sms_inbound
        ),
        latest AS (
          SELECT phone,
            MAX(created_at) as last_message_at,
            COUNT(*) FILTER (WHERE unread) as unread_count
          FROM all_messages
          GROUP BY phone
        )
        SELECT
          l.phone, l.last_message_at, l.unread_count,
          COALESCE(dp.display_name, dp.first_name) as name,
          u.profile_type
        FROM latest l
        LEFT JOIN driver_profiles dp ON (dp.phone = l.phone OR dp.phone = '+1' || l.phone)
        LEFT JOIN users u ON u.id = dp.user_id
        ORDER BY l.unread_count DESC, l.last_message_at DESC
        LIMIT 50
      `;

  return NextResponse.json({
    threads: threads.map((t: Record<string, unknown>) => ({
      phone: t.phone,
      name: t.name ?? null,
      profileType: t.profile_type ?? null,
      lastMessageAt: t.last_message_at,
      unreadCount: Number(t.unread_count ?? 0),
    })),
    smsStats: {
      outbound: outboundCount,
      inbound: inboundCount,
      failed: failedCount,
      total: totalMessages,
      cost: Math.round(smsCost * 100) / 100,
      costPerSms: 0.0075,
      costPerMms: 0.02,
      byEventType: eventBreakdown.map((e: Record<string, unknown>) => ({
        type: e.event_type,
        count: Number(e.count),
      })),
    },
  });
}

// PATCH — mark as read for a phone (or ALL)
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  if (phone === 'ALL') {
    const updated = await sql`UPDATE sms_inbound SET read = true WHERE read = false RETURNING id` as { id: string }[];
    if (updated.length > 0) {
      publishAdminEvent('message_read', { phone: 'ALL', count: updated.length }).catch(() => {});
    }
  } else {
    const normalized = phone.replace(/\D/g, '');
    const updated = await sql`UPDATE sms_inbound SET read = true WHERE from_phone = ${normalized} AND read = false RETURNING id` as { id: string }[];
    if (updated.length > 0) {
      publishAdminEvent('message_read', { phone: normalized, count: updated.length }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true });
}
