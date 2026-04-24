// Safety check-in scheduler — fired from .github/workflows/cron.yml every
// 5 minutes (GitHub Actions minimum). Picks up due scheduled prompts AND
// anomaly detections, inserts a ride_safety_checks row, then publishes
// 'safety_check_prompt' to ride:{id} so the active-ride client mounts the
// overlay.
//
// Why GitHub Actions and not Cloudflare cron triggers:
// - This project uses OpenNext for Cloudflare. OpenNext doesn't auto-wire
//   wrangler triggers.crons → Next.js routes (no scheduled() handler in
//   the generated worker). The existing /api/cron/* routes are all
//   driven externally via cron.yml — we follow the same convention.
// - 5-min cadence floors prompt timing precision at 5 min. Platform
//   default interval is 10-15 min so this is still on-cadence; anomaly
//   detection at 5-min lag is acceptable. If tighter cadence is needed
//   later, override the OpenNext worker with a custom scheduled() handler
//   and switch to native triggers.crons.
//
// Request security: X-Cron-Secret header must equal process.env.CRON_SECRET.
//
// Idempotency: the scheduler inserts a new ride_safety_checks row per prompt.
// Ably re-delivery + overlay dedup (checkId equality) guard the client; the
// interval clock + hasOpenEvent dedup guard the server.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, publishAdminEvent } from '@/lib/ably/server';
import { loadActiveRideParties, decideDue, getPlatformSafetyConfig } from '@/lib/safety/scheduler';
import {
  detectActiveRideAnomalies,
  hasOpenEvent,
  loadRidePartyIds,
} from '@/lib/safety/anomaly';
import type { SafetyCheckTrigger } from '@/lib/db/types';

async function insertCheckAndPublish(args: {
  rideId: string;
  userId: string;
  party: 'rider' | 'driver';
  trigger: SafetyCheckTrigger;
  autoDismissSeconds: number;
  relatedEventId?: string | null;
}): Promise<string> {
  const { rideId, userId, party, trigger, autoDismissSeconds, relatedEventId } = args;
  const rows = (await sql`
    INSERT INTO ride_safety_checks (ride_id, user_id, party, trigger, related_event_id)
    VALUES (${rideId}, ${userId}, ${party}, ${trigger}, ${relatedEventId ?? null})
    RETURNING id, sent_at
  `) as Array<{ id: string; sent_at: Date }>;
  const { id, sent_at } = rows[0];

  await publishRideUpdate(rideId, 'safety_check_prompt', {
    checkId: id,
    party,
    trigger,
    autoDismissSeconds,
    sentAt: sent_at,
  });

  // Tell admin feed so live-map / safety queue stays in sync without polling.
  await publishAdminEvent('safety_check_sent', {
    rideId, checkId: id, party, trigger, sentAt: sent_at,
  });

  return id;
}

async function flagIgnoredStreak(args: {
  rideId: string;
  userId: string;
  party: 'rider' | 'driver';
  streakCount: number;
}) {
  const { rideId, userId, party, streakCount } = args;
  // Only emit the event once per ride×user — dedupe on open events.
  const existing = (await sql`
    SELECT 1 FROM ride_safety_events
    WHERE ride_id = ${rideId}
      AND triggered_by_user_id = ${userId}
      AND event_type = 'ignored_streak'
      AND admin_resolved_at IS NULL
    LIMIT 1
  `) as Array<unknown>;
  if (existing.length) return;

  const evt = (await sql`
    INSERT INTO ride_safety_events (
      ride_id, event_type, severity, party, triggered_by_user_id, evidence
    ) VALUES (
      ${rideId}, 'ignored_streak', 'warn', ${party}, ${userId},
      ${JSON.stringify({ streak_count: streakCount })}::jsonb
    )
    RETURNING id, detected_at
  `) as Array<{ id: string; detected_at: Date }>;

  await publishAdminEvent('safety_alert', {
    rideId,
    eventId: evt[0].id,
    party,
    userId,
    severity: 'warn',
    reason: 'ignored_streak',
    streakCount,
    at: evt[0].detected_at,
  });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const sentSecret = req.headers.get('x-cron-secret') || '';
  if (!secret || sentSecret !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cfg = await getPlatformSafetyConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ ok: true, skipped: 'platform_disabled' });
  }

  const parties = await loadActiveRideParties();
  const now = new Date();

  // Layer A: anomaly detection. Runs independently of party-level scheduling
  // and can synthesize a new high-priority check-in for a specific party.
  // Dedup by (ride_id, event_type) so a persistent condition doesn't spam.
  const anomalyHits = parties.length === 0 ? [] : await detectActiveRideAnomalies(await getPlatformSafetyConfig(), now);
  let anomaliesOpened = 0;
  let anomalyFollowups = 0;

  for (const hit of anomalyHits) {
    try {
      if (await hasOpenEvent(hit.ride_id, hit.event_type)) continue;
      const rideParties = await loadRidePartyIds(hit.ride_id);
      if (!rideParties) continue;
      const targetUserId = hit.target_party === 'driver' ? rideParties.driver_id : rideParties.rider_id;

      const evtRows = (await sql`
        INSERT INTO ride_safety_events (
          ride_id, event_type, severity, party, triggered_by_user_id,
          evidence, location_lat, location_lng
        ) VALUES (
          ${hit.ride_id}, ${hit.event_type}, ${hit.severity}, 'system', NULL,
          ${JSON.stringify(hit.evidence)}::jsonb,
          ${hit.location_lat}, ${hit.location_lng}
        )
        RETURNING id, detected_at
      `) as Array<{ id: string; detected_at: Date }>;
      const eventId = evtRows[0].id;
      anomaliesOpened++;

      await publishAdminEvent('safety_alert', {
        rideId: hit.ride_id,
        eventId,
        party: hit.target_party,
        source: 'anomaly',
        reason: hit.event_type,
        severity: hit.severity,
        lat: hit.location_lat, lng: hit.location_lng,
        evidence: hit.evidence,
        at: evtRows[0].detected_at,
      });

      // Synthesize an anomaly_followup check-in so the affected party gets a
      // prompt even if their scheduled interval hasn't arrived yet.
      await insertCheckAndPublish({
        rideId: hit.ride_id,
        userId: targetUserId,
        party: hit.target_party,
        trigger: 'anomaly_followup',
        autoDismissSeconds: (await getPlatformSafetyConfig()).prompt_auto_dismiss_seconds,
        relatedEventId: eventId,
      });
      anomalyFollowups++;
    } catch (err) {
      console.error('anomaly handling failed for', hit.ride_id, hit.event_type, err);
    }
  }

  if (parties.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, prompts_sent: 0, anomalies_opened: anomaliesOpened });
  }

  let promptsSent = 0;
  let ignoredFlags = 0;

  for (const p of parties) {
    try {
      // Flag an ignored streak once the threshold is crossed. Doesn't block
      // further prompts — admin just sees the alert.
      if (p.ignored_streak >= cfg.ignored_streak_threshold) {
        await flagIgnoredStreak({
          rideId: p.ride_id,
          userId: p.user_id,
          party: p.party,
          streakCount: p.ignored_streak,
        });
        ignoredFlags++;
      }

      const decision = decideDue(p, cfg, now);
      if (!decision.due) continue;

      await insertCheckAndPublish({
        rideId: p.ride_id,
        userId: p.user_id,
        party: p.party,
        trigger: 'scheduled',
        autoDismissSeconds: cfg.prompt_auto_dismiss_seconds,
      });
      promptsSent++;
    } catch (err) {
      console.error('safety scheduler failed for', p.ride_id, p.party, err);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: parties.length,
    prompts_sent: promptsSent,
    ignored_flags: ignoredFlags,
    anomalies_opened: anomaliesOpened,
    anomaly_followups: anomalyFollowups,
  });
}
