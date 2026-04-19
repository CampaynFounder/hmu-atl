// Analytics queries for the Conversation Agent admin dashboard.
// All queries filter by conversation_threads.created_at within a day range.

import { sql } from '@/lib/db/client';

export interface FunnelCounts {
  total: number;
  withOutbound: number;       // messages_sent > 0
  withInbound: number;        // messages_received > 0
  visionDelivered: number;    // vision_delivered_at IS NOT NULL
  dormant: number;            // status = 'dormant'
  optedOut: number;           // status = 'opted_out'
  manual: number;             // status = 'manual'
  flaggedForReview: number;   // flagged_for_review = true
}

export interface PersonaMetric {
  personaId: string;
  slug: string;
  displayName: string;
  threadCount: number;
  outboundCount: number;
  replyCount: number;
  optOutCount: number;
  avgMessagesSent: number;
  avgMessagesReceived: number;
  avgTimeToReplyMin: number | null;
}

export interface SourceMetric {
  source: string;             // users.how_heard or 'unknown'
  threadCount: number;
  replyCount: number;
  optOutCount: number;
}

export interface AnalyticsSnapshot {
  rangeDays: number;
  funnel: FunnelCounts;
  perPersona: PersonaMetric[];
  perSource: SourceMetric[];
  claudeSpendTodayCents: number;
  claudeSpendCapCents: number | null;
}

function clampRange(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 30;
  return Math.min(Math.floor(days), 365);
}

export async function getAnalytics(rangeDaysInput = 30): Promise<AnalyticsSnapshot> {
  const rangeDays = clampRange(rangeDaysInput);

  const funnelRows = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE messages_sent > 0)::int AS with_outbound,
      COUNT(*) FILTER (WHERE messages_received > 0)::int AS with_inbound,
      COUNT(*) FILTER (WHERE vision_delivered_at IS NOT NULL)::int AS vision_delivered,
      COUNT(*) FILTER (WHERE status = 'dormant')::int AS dormant,
      COUNT(*) FILTER (WHERE status = 'opted_out')::int AS opted_out,
      COUNT(*) FILTER (WHERE status = 'manual')::int AS manual_count,
      COUNT(*) FILTER (WHERE flagged_for_review = TRUE)::int AS flagged
    FROM conversation_threads
    WHERE created_at >= NOW() - (${rangeDays}::int || ' days')::interval
  `;
  const f = funnelRows[0] as {
    total: number; with_outbound: number; with_inbound: number;
    vision_delivered: number; dormant: number; opted_out: number;
    manual_count: number; flagged: number;
  };
  const funnel: FunnelCounts = {
    total: f.total,
    withOutbound: f.with_outbound,
    withInbound: f.with_inbound,
    visionDelivered: f.vision_delivered,
    dormant: f.dormant,
    optedOut: f.opted_out,
    manual: f.manual_count,
    flaggedForReview: f.flagged,
  };

  // Per-persona. LEFT JOIN so personas with zero threads still appear.
  const personaRows = await sql`
    SELECT
      p.id AS persona_id,
      p.slug,
      p.display_name,
      COUNT(t.id)::int AS thread_count,
      COUNT(t.id) FILTER (WHERE t.messages_sent > 0)::int AS outbound_count,
      COUNT(t.id) FILTER (WHERE t.messages_received > 0)::int AS reply_count,
      COUNT(t.id) FILTER (WHERE t.status = 'opted_out')::int AS opt_out_count,
      COALESCE(AVG(t.messages_sent), 0)::numeric(10,2) AS avg_sent,
      COALESCE(AVG(t.messages_received), 0)::numeric(10,2) AS avg_received
    FROM conversation_personas p
    LEFT JOIN conversation_threads t
      ON t.persona_id = p.id
      AND t.created_at >= NOW() - (${rangeDays}::int || ' days')::interval
    GROUP BY p.id, p.slug, p.display_name, p.sort_order
    ORDER BY p.sort_order ASC, p.display_name ASC
  `;

  // Avg time-to-reply per persona — separate query because it requires
  // per-thread first-inbound-minus-first-outbound, not a simple aggregate.
  const ttrRows = await sql`
    SELECT
      t.persona_id,
      COALESCE(AVG(EXTRACT(EPOCH FROM (first_in.first_at - first_out.first_at)) / 60), 0)::numeric(10,2) AS avg_ttr_min
    FROM conversation_threads t
    JOIN LATERAL (
      SELECT MIN(sent_at) AS first_at FROM conversation_messages
      WHERE thread_id = t.id AND direction = 'outbound'
    ) first_out ON TRUE
    JOIN LATERAL (
      SELECT MIN(sent_at) AS first_at FROM conversation_messages
      WHERE thread_id = t.id AND direction = 'inbound'
    ) first_in ON TRUE
    WHERE t.created_at >= NOW() - (${rangeDays}::int || ' days')::interval
      AND first_out.first_at IS NOT NULL
      AND first_in.first_at IS NOT NULL
    GROUP BY t.persona_id
  `;
  const ttrMap = new Map<string, number>();
  for (const row of ttrRows as Array<{ persona_id: string; avg_ttr_min: string | number }>) {
    ttrMap.set(row.persona_id, Number(row.avg_ttr_min));
  }

  const perPersona: PersonaMetric[] = (personaRows as Array<{
    persona_id: string;
    slug: string;
    display_name: string;
    thread_count: number;
    outbound_count: number;
    reply_count: number;
    opt_out_count: number;
    avg_sent: string | number;
    avg_received: string | number;
  }>).map(r => ({
    personaId: r.persona_id,
    slug: r.slug,
    displayName: r.display_name,
    threadCount: r.thread_count,
    outboundCount: r.outbound_count,
    replyCount: r.reply_count,
    optOutCount: r.opt_out_count,
    avgMessagesSent: Number(r.avg_sent),
    avgMessagesReceived: Number(r.avg_received),
    avgTimeToReplyMin: ttrMap.get(r.persona_id) ?? null,
  }));

  const sourceRows = await sql`
    SELECT
      COALESCE(u.how_heard, 'unknown') AS source,
      COUNT(DISTINCT t.id)::int AS thread_count,
      COUNT(DISTINCT t.id) FILTER (WHERE t.messages_received > 0)::int AS reply_count,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'opted_out')::int AS opt_out_count
    FROM conversation_threads t
    JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= NOW() - (${rangeDays}::int || ' days')::interval
    GROUP BY u.how_heard
    ORDER BY thread_count DESC, source ASC
  `;
  const perSource: SourceMetric[] = (sourceRows as Array<{
    source: string; thread_count: number; reply_count: number; opt_out_count: number;
  }>).map(r => ({
    source: r.source,
    threadCount: r.thread_count,
    replyCount: r.reply_count,
    optOutCount: r.opt_out_count,
  }));

  const spendRows = await sql`
    SELECT claude_spend_today_cents, daily_spend_cap_cents, claude_spend_reset_date
    FROM conversation_agent_config WHERE id = 1 LIMIT 1
  `;
  const s = spendRows[0] as {
    claude_spend_today_cents: number;
    daily_spend_cap_cents: number | null;
    claude_spend_reset_date: string;
  } | undefined;
  const today = new Date().toISOString().slice(0, 10);
  const spentToday = s && s.claude_spend_reset_date === today ? s.claude_spend_today_cents : 0;

  return {
    rangeDays,
    funnel,
    perPersona,
    perSource,
    claudeSpendTodayCents: spentToday,
    claudeSpendCapCents: s?.daily_spend_cap_cents ?? null,
  };
}
