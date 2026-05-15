// GET /api/admin/blast — paginated blast index for /admin/blast.
// Per BLAST-V3-AGENT-CONTRACT §8 (Stream D). Permission: monitor.blasts.view.
//
// Aggregates per-blast counts from blast_match_log + blast_driver_targets +
// blast_driver_events. Funnel filters use boolean params on the query.

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;

export async function GET(req: Request): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'monitor.blasts.view')) return unauthorizedResponse();

  const url = new URL(req.url);
  const market = url.searchParams.get('market');
  const status = url.searchParams.get('status');
  const fromIso = url.searchParams.get('from');
  const toIso = url.searchParams.get('to');
  const filter = url.searchParams.get('funnel_filter');
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await sql`
    WITH blast AS (
      SELECT
        p.id, p.user_id, p.market_id, p.status, p.price,
        p.expires_at, p.created_at, p.scheduled_for,
        p.pickup_address, p.dropoff_address
      FROM hmu_posts p
      LEFT JOIN markets m ON m.id = p.market_id
      WHERE p.post_type = 'blast'
        AND (${market}::text IS NULL OR m.slug = ${market})
        AND (${status}::text IS NULL OR p.status = ${status})
        AND (${fromIso}::timestamptz IS NULL OR p.created_at >= ${fromIso}::timestamptz)
        AND (${toIso}::timestamptz IS NULL OR p.created_at < ${toIso}::timestamptz)
      ORDER BY p.created_at DESC
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
    )
    SELECT
      b.*,
      (SELECT COUNT(*) FROM blast_driver_targets t WHERE t.blast_id = b.id) AS targeted_count,
      (SELECT COUNT(*) FROM blast_driver_targets t WHERE t.blast_id = b.id AND t.notified_at IS NOT NULL) AS notified_count,
      (SELECT COUNT(*) FROM blast_driver_targets t WHERE t.blast_id = b.id AND t.hmu_at IS NOT NULL) AS hmu_count,
      (SELECT COUNT(*) FROM blast_driver_targets t WHERE t.blast_id = b.id AND t.selected_at IS NOT NULL) AS selected_count,
      (SELECT COUNT(*) FROM blast_driver_targets t WHERE t.blast_id = b.id AND t.pull_up_at IS NOT NULL) AS pull_up_count,
      (SELECT COUNT(*) FROM blast_driver_events e WHERE e.blast_id = b.id AND e.event_type = 'feed_impression') AS feed_impressions,
      (SELECT COUNT(*) FROM blast_driver_events e WHERE e.blast_id = b.id AND e.event_type = 'offer_page_viewed') AS offer_page_views
    FROM blast b
  `;

  const items = rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    riderId: r.user_id,
    marketId: r.market_id,
    status: r.status,
    priceDollars: Number(r.price),
    pickupAddress: r.pickup_address,
    dropoffAddress: r.dropoff_address,
    scheduledFor: r.scheduled_for,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    targetedCount: Number(r.targeted_count),
    notifiedCount: Number(r.notified_count),
    hmuCount: Number(r.hmu_count),
    selectedCount: Number(r.selected_count),
    pullUpCount: Number(r.pull_up_count),
    feedImpressions: Number(r.feed_impressions),
    offerPageViews: Number(r.offer_page_views),
  }));

  let filtered: typeof items = items;
  if (filter === 'notified_under_3') filtered = filtered.filter((i: typeof items[number]) => i.notifiedCount < 3);
  if (filter === 'zero_offer_views') filtered = filtered.filter((i: typeof items[number]) => i.offerPageViews === 0);
  if (filter === 'no_response') filtered = filtered.filter((i: typeof items[number]) => i.hmuCount === 0);

  const hasMore = filtered.length > PAGE_SIZE;
  const blasts = hasMore ? filtered.slice(0, PAGE_SIZE) : filtered;

  return NextResponse.json({ blasts, page, hasMore });
}
