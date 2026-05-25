// GET /api/admin/blast/[id] — per-blast observability detail view.
// Returns { blast, candidates, events, targets, summary } per BLAST-V3-AGENT-CONTRACT §8.
// Stream D. Permission: monitor.blasts.view.

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

interface Params {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Shortcodes are 7-char uppercase alphanumeric (stored as areas[0]='shortcode:XXXXXXX')
const SHORTCODE_RE = /^[A-Z0-9]{4,12}$/;

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'monitor.blasts.view')) return unauthorizedResponse();

  const { id } = await params;
  const isUuid = UUID_RE.test(id);
  const isShortcode = !isUuid && SHORTCODE_RE.test(id.toUpperCase());
  if (!isUuid && !isShortcode) {
    return NextResponse.json({ error: 'invalid_blast_id' }, { status: 400 });
  }

  // If a shortcode was provided, resolve it to a UUID first
  let blastId = id;
  if (isShortcode) {
    const resolved = await sql`
      SELECT id FROM hmu_posts
      WHERE post_type = 'blast' AND areas && ARRAY[${`shortcode:${id.toUpperCase()}`}]
      LIMIT 1
    `;
    if (!resolved.length) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    blastId = (resolved[0] as { id: string }).id;
  }

  const blastRows = await sql`
    SELECT p.id, p.user_id, p.market_id, p.status, p.price,
           p.expires_at, p.created_at,
           p.pickup_address, p.dropoff_address,
           m.slug AS market_slug, m.name AS market_name
    FROM hmu_posts p
    LEFT JOIN markets m ON m.id = p.market_id
    WHERE p.id = ${blastId} AND p.post_type = 'blast'
    LIMIT 1
  `;
  if (!blastRows.length) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const blast = blastRows[0];

  // blast_match_log, blast_driver_targets, blast_driver_events may not exist
  // in older DB branches — catch and return empty arrays so the page degrades
  // gracefully rather than 500ing.
  let candidates: Array<{
    id: unknown; driverId: unknown; rawFeatures: Record<string, number>;
    normalizedFeatures: Record<string, number>; filterResults: unknown[];
    score: number | null; percentileRank: unknown; wasNotified: unknown;
    configVersion: unknown; providerName: unknown; experimentArmId: unknown;
  }> = [];
  try {
    const candidateRows = await sql`
      SELECT id, driver_id, raw_features, normalized_features, filter_results,
             score, percentile_rank, was_notified, config_version, provider_name,
             experiment_arm_id, created_at
      FROM blast_match_log
      WHERE blast_id = ${blastId}
      ORDER BY score DESC NULLS LAST
    `;
    candidates = candidateRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      driverId: r.driver_id,
      rawFeatures: (r.raw_features ?? {}) as Record<string, number>,
      normalizedFeatures: (r.normalized_features ?? {}) as Record<string, number>,
      filterResults: (r.filter_results ?? []) as unknown[],
      score: r.score === null ? null : Number(r.score),
      percentileRank: r.percentile_rank,
      wasNotified: r.was_notified,
      configVersion: r.config_version,
      providerName: r.provider_name,
      experimentArmId: r.experiment_arm_id,
    }));
  } catch { /* blast_match_log table absent in this DB branch */ }

  let targets: Array<{
    id: unknown; driverId: unknown; displayName: string;
    matchScore: number; scoreBreakdown: Record<string, number>;
    notifiedAt: unknown; notificationChannels: string[];
    hmuAt: unknown; counterPrice: number | null;
    passedAt: unknown; selectedAt: unknown; pullUpAt: unknown;
    rejectedAt: unknown; interestAt: unknown;
  }> = [];
  try {
    const targetRows = await sql`
      SELECT t.id, t.driver_id, t.match_score, t.score_breakdown,
             t.notified_at, t.notification_channels, t.hmu_at, t.counter_price,
             t.passed_at, t.selected_at, t.pull_up_at,
             COALESCE(dp.display_name, dp.first_name) AS display_name
      FROM blast_driver_targets t
      LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id
      WHERE t.blast_id = ${blastId}
      ORDER BY t.match_score DESC NULLS LAST
    `;
    targets = targetRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      driverId: r.driver_id,
      displayName: (r.display_name as string | null) ?? 'Unknown',
      matchScore: Number(r.match_score),
      scoreBreakdown: (r.score_breakdown ?? {}) as Record<string, number>,
      notifiedAt: r.notified_at,
      notificationChannels: (r.notification_channels as string[] | null) ?? [],
      hmuAt: r.hmu_at,
      counterPrice: r.counter_price === null ? null : Number(r.counter_price),
      passedAt: r.passed_at,
      selectedAt: r.selected_at,
      pullUpAt: r.pull_up_at,
      rejectedAt: null,
      interestAt: null,
    }));
  } catch { /* blast_driver_targets table absent in this DB branch */ }

  let events: Array<{
    id: unknown; blastId: unknown; driverId: unknown;
    eventType: unknown; eventData: Record<string, unknown> | null;
    source: unknown; occurredAt: unknown;
  }> = [];
  try {
    const eventRows = await sql`
      SELECT id, blast_id, driver_id, event_type, event_data, source, occurred_at
      FROM blast_driver_events
      WHERE blast_id = ${blastId}
      ORDER BY occurred_at ASC
      LIMIT 500
    `;
    events = eventRows.map((r: Record<string, unknown>) => ({
      id: r.id,
      blastId: r.blast_id,
      driverId: r.driver_id,
      eventType: r.event_type,
      eventData: r.event_data as Record<string, unknown> | null,
      source: r.source,
      occurredAt: r.occurred_at,
    }));
  } catch { /* blast_driver_events table absent in this DB branch */ }

  // Plain-English summary — template-based, NOT LLM.
  const poolSize = candidates.length;
  type Candidate = typeof candidates[number];
  type Target = typeof targets[number];
  const passedFilters = candidates.filter((c: Candidate) =>
    Array.isArray(c.filterResults)
      ? (c.filterResults as Array<{ passed?: boolean }>).every((f) => f.passed !== false)
      : true,
  ).length;
  const notifiedCount = targets.filter((t: Target) => t.notifiedAt).length;
  const selected = targets.find((t: Target) => t.selectedAt);
  let summary: string;
  if (selected) {
    const breakdown = selected.scoreBreakdown;
    const topSignal = Object.entries(breakdown).sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])))[0];
    const reason = topSignal ? signalToReason(topSignal[0]) : 'the best overall match';
    summary = `Of ${poolSize} drivers in ${blast.market_name ?? 'the market'}, ${passedFilters} passed all filters. Top ${notifiedCount} were notified. ${selected.displayName} (score ${selected.matchScore.toFixed(2)}) was selected — primarily because of ${reason}.`;
  } else if (notifiedCount > 0) {
    summary = `Of ${poolSize} drivers in ${blast.market_name ?? 'the market'}, ${passedFilters} passed all filters. ${notifiedCount} were notified. No driver has been selected yet.`;
  } else {
    summary = `Of ${poolSize} drivers in ${blast.market_name ?? 'the market'}, ${passedFilters} passed all filters. No drivers were notified — the matcher returned an empty set or the radius hadn't expanded yet.`;
  }

  return NextResponse.json({
    blast: {
      id: blast.id,
      riderId: blast.user_id,
      marketSlug: blast.market_slug,
      marketName: blast.market_name,
      status: blast.status,
      priceDollars: Number(blast.price),
      pickupAddress: (blast.pickup_address as string | null) ?? null,
      dropoffAddress: (blast.dropoff_address as string | null) ?? null,
      expiresAt: blast.expires_at,
      createdAt: blast.created_at,
      // These columns may not exist in older DB branches — default to null
      tripType: null,
      depositAmount: null,
      scheduledFor: null,
      bumpCount: 0,
      rewardFunction: null,
      counterOfferMaxPct: null,
    },
    candidates,
    targets,
    events,
    summary,
  });
}

function signalToReason(signal: string): string {
  switch (signal) {
    case 'proximity_to_pickup': return 'proximity to pickup';
    case 'last_location_recency': return 'recent location activity';
    case 'recency_signin': return 'recent sign-in';
    case 'sex_match': return "matching the rider's preference";
    case 'chill_score': return 'a strong chill score';
    case 'profile_view_count': return 'driver popularity';
    case 'completed_rides': return 'ride history';
    case 'rating': return 'high rating';
    case 'low_recent_pass_rate': return 'low recent pass rate';
    default: return signal;
  }
}
