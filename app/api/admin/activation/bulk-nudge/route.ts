// POST /api/admin/activation/bulk-nudge — send one activation SMS check to
// every active driver/rider currently in the given lifecycle stage. The
// founder-facing UI exposes this only when a stage chip is selected so the
// blast radius is constrained and visible. Each recipient is logged to
// admin_sms_sent + sms_log with eventType='activation_nudge:{checkKey}' so
// effectiveness can be analyzed later.
//
// Body: { stage, checkKey, profileType: 'driver'|'rider', marketId? }
//
// We intentionally re-fetch the cohort server-side rather than trusting a
// list of user IDs from the client — keeps the action authoritative and
// dedupes against very-recent state changes.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { findRecentlyNudged, DEFAULT_DEDUP_WINDOW_HOURS } from '@/lib/sms/dedup';
import {
  computeDriverChecks, computeRiderChecks,
  classifyDriverStage, classifyRiderStage,
  renderSms, LIFECYCLE_STAGES,
  type ActivationCheckKey, type LifecycleStage,
} from '@/lib/admin/activation-checks';

const PER_RECIPIENT_DELAY_MS = 500;
const MAX_PER_BATCH = 100;

interface DriverCohortRow {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  phone: string | null;
  area_slugs: string[] | null;
  services_entire_market: boolean | null;
  pricing: Record<string, unknown> | null;
  thumbnail_url: string | null;
  video_url: string | null;
  vehicle_info: Record<string, unknown> | null;
  profile_visible: boolean | null;
  stripe_onboarding_complete: boolean | null;
  last_sign_in_at: string | null;
  has_profile_row: boolean;
  has_posts: boolean;
}

interface RiderCohortRow {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  thumbnail_url: string | null;
  avatar_url: string | null;
  last_sign_in_at: string | null;
  rides_completed_count: number;
  ride_requests_count: number;
  has_payment_method: boolean;
  has_profile_row: boolean;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as {
    stage?: string;
    checkKey?: string;
    profileType?: 'driver' | 'rider';
    marketId?: string | null;
  };

  if (!body.stage || !(LIFECYCLE_STAGES as string[]).includes(body.stage)) {
    return NextResponse.json({ error: 'invalid stage' }, { status: 400 });
  }
  if (body.profileType !== 'driver' && body.profileType !== 'rider') {
    return NextResponse.json({ error: 'profileType must be driver or rider' }, { status: 400 });
  }
  if (!body.checkKey) {
    return NextResponse.json({ error: 'checkKey required' }, { status: 400 });
  }
  const stage = body.stage as LifecycleStage;
  const checkKey = body.checkKey as ActivationCheckKey;
  const marketId = body.marketId || null;

  // Build the cohort using the same query shape as /api/admin/activation,
  // then filter by stage in memory (cheap — bounded by LIMIT 500 per market).
  const recipients: Array<{ userId: string; phone: string; displayName: string | null; smsTemplate: string }> = [];

  if (body.profileType === 'driver') {
    const rows = await sql`
      SELECT
        u.id as user_id, dp.display_name, dp.handle, dp.phone, dp.area_slugs,
        dp.services_entire_market, dp.pricing, dp.thumbnail_url, dp.video_url,
        dp.vehicle_info, dp.profile_visible, dp.stripe_onboarding_complete,
        u.last_sign_in_at,
        (dp.user_id IS NOT NULL) as has_profile_row,
        EXISTS (SELECT 1 FROM hmu_posts hp WHERE hp.user_id = u.id) as has_posts
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.profile_type = 'driver'
        AND u.account_status IN ('active', 'pending_activation')
        AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
      LIMIT 500
    ` as unknown as DriverCohortRow[];

    for (const d of rows) {
      const userStage = classifyDriverStage({
        has_profile_row: d.has_profile_row,
        display_name: d.display_name,
        handle: d.handle,
        area_slugs: d.area_slugs,
        services_entire_market: d.services_entire_market,
        pricing: d.pricing,
        thumbnail_url: d.thumbnail_url,
        video_url: d.video_url,
        vehicle_info: d.vehicle_info,
        stripe_onboarding_complete: d.stripe_onboarding_complete,
        last_sign_in_at: d.last_sign_in_at,
        has_posts: d.has_posts,
      });
      if (userStage !== stage) continue;
      if (!d.phone) continue;

      const checks = computeDriverChecks({
        display_name: d.display_name, handle: d.handle, area_slugs: d.area_slugs,
        services_entire_market: d.services_entire_market, pricing: d.pricing,
        thumbnail_url: d.thumbnail_url, video_url: d.video_url,
        vehicle_info: d.vehicle_info, profile_visible: d.profile_visible,
        stripe_onboarding_complete: d.stripe_onboarding_complete,
        has_profile_row: d.has_profile_row,
      });
      const matchingCheck = checks.find(c => c.key === checkKey);
      // Skip users who already pass this check — bulk send must not text users
      // who don't need the nudge. (Cheap safety net even though stage filter
      // usually implies the gap exists.)
      if (!matchingCheck || matchingCheck.passed) continue;

      recipients.push({
        userId: d.user_id, phone: d.phone, displayName: d.display_name,
        smsTemplate: matchingCheck.smsTemplate,
      });
    }
  } else {
    const rows = await sql`
      SELECT
        u.id as user_id, rp.display_name, rp.phone, rp.thumbnail_url, rp.avatar_url,
        u.last_sign_in_at,
        (SELECT COUNT(*) FROM rides r WHERE r.rider_id = u.id AND r.status = 'completed') as rides_completed_count,
        (SELECT COUNT(*) FROM hmu_posts hp WHERE hp.user_id = u.id AND hp.post_type = 'rider_request') as ride_requests_count,
        EXISTS (SELECT 1 FROM rider_payment_methods rpm WHERE rpm.rider_id = u.id) as has_payment_method,
        (rp.user_id IS NOT NULL) as has_profile_row
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.profile_type = 'rider'
        AND u.account_status IN ('active', 'pending_activation')
        AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
      LIMIT 500
    ` as unknown as RiderCohortRow[];

    for (const r of rows) {
      const ridesCompleted = Number(r.rides_completed_count ?? 0);
      const rideRequests = Number(r.ride_requests_count ?? 0);
      const userStage = classifyRiderStage({
        has_profile_row: r.has_profile_row,
        display_name: r.display_name,
        thumbnail_url: r.thumbnail_url,
        avatar_url: r.avatar_url,
        has_payment_method: r.has_payment_method,
        rides_completed_count: ridesCompleted,
        ride_requests_count: rideRequests,
        last_sign_in_at: r.last_sign_in_at,
      });
      if (userStage !== stage) continue;
      if (!r.phone) continue;

      const checks = computeRiderChecks({
        display_name: r.display_name, thumbnail_url: r.thumbnail_url,
        avatar_url: r.avatar_url, last_sign_in_at: r.last_sign_in_at,
        rides_completed_count: ridesCompleted, ride_requests_count: rideRequests,
        has_payment_method: r.has_payment_method, has_profile_row: r.has_profile_row,
      });
      const matchingCheck = checks.find(c => c.key === checkKey);
      if (!matchingCheck || matchingCheck.passed) continue;

      recipients.push({
        userId: r.user_id, phone: r.phone, displayName: r.display_name,
        smsTemplate: matchingCheck.smsTemplate,
      });
    }
  }

  const eventType = `activation_nudge:${checkKey}`;

  // Dedup pass — skip users who already received this exact nudge within the
  // dedup window (default 72h). Founder set the window during the activation
  // refactor; raise via DEDUP_WINDOW_HOURS query param if a re-blast is
  // intentional (e.g. weekly re-nudge).
  const overrideWindow = req.nextUrl.searchParams.get('windowHours');
  const windowHours = overrideWindow ? Math.max(1, Number(overrideWindow)) : DEFAULT_DEDUP_WINDOW_HOURS;
  const recentlyNudged = await findRecentlyNudged(
    recipients.map(r => r.userId), eventType, windowHours,
  );
  const beforeDedup = recipients.length;
  const filtered = recipients.filter(r => !recentlyNudged.has(r.userId));
  const skippedRecent = beforeDedup - filtered.length;

  if (filtered.length === 0) {
    return NextResponse.json({
      sent: 0, failed: 0, total: 0, skipped_recent: skippedRecent,
      message: skippedRecent > 0
        ? `All ${skippedRecent} matching users were already nudged with this check in the last ${windowHours}h.`
        : 'No recipients matched (stage may have shifted, or all already pass this check).',
    });
  }

  if (filtered.length > MAX_PER_BATCH) {
    return NextResponse.json({
      error: `Cohort is ${filtered.length} users (after dedup) — exceeds per-batch cap of ${MAX_PER_BATCH}. Narrow the cohort and try again.`,
    }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;
  const results: Array<{ userId: string; phone: string; status: 'sent' | 'failed'; error?: string }> = [];

  for (const rec of filtered) {
    const phone = rec.phone.replace(/\D/g, '');
    const message = renderSms(rec.smsTemplate, rec.displayName);
    const truncated = message.length > 160 ? message.slice(0, 160) : message;
    const result = await sendSms(phone, truncated, {
      eventType,
      market: 'atl',
      userId: rec.userId,
    });
    if (result.success) {
      sent++;
      results.push({ userId: rec.userId, phone: rec.phone, status: 'sent' });
      try {
        await sql`
          INSERT INTO admin_sms_sent (admin_id, recipient_id, recipient_phone, message, status)
          VALUES (${admin.id}, ${rec.userId}, ${phone}, ${truncated}, 'sent')
        `;
      } catch (auditErr) {
        console.error('[ACTIVATION_BULK_NUDGE] audit insert failed:', auditErr);
      }
    } else {
      failed++;
      results.push({ userId: rec.userId, phone: rec.phone, status: 'failed', error: result.error });
    }
    await new Promise(r => setTimeout(r, PER_RECIPIENT_DELAY_MS));
  }

  await logAdminAction(admin.id, 'activation_bulk_nudge', 'cohort', undefined, {
    stage, checkKey, profileType: body.profileType, marketId,
    recipientCount: filtered.length, sent, failed,
    cohortBeforeDedup: beforeDedup, skippedRecent, windowHours,
  });

  return NextResponse.json({
    sent, failed, total: filtered.length,
    skipped_recent: skippedRecent,
    cohort_before_dedup: beforeDedup,
    window_hours: windowHours,
    results,
  });
}
