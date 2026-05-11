// GET /api/admin/activation — every signed-up driver/rider with completeness +
// lifecycle stage. The previous version filtered to "payment-ready" users only,
// which hid the cohort that needs activation most (no payout setup / no PM).
// Returns drivers + riders separately, each row carrying area chips, coverage
// bucket, completeness %, lifecycle stage, and the failed checks so the UI can
// render the gap chips and the Nudge button without further round-trips.
//
// Query params:
//   marketId — UUID, scopes by users.market_id when present
//   stage    — one of LIFECYCLE_STAGES, narrows the response to that stage
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import {
  computeDriverChecks, computeRiderChecks, classifyCoverage, completenessPercent,
  classifyDriverStage, classifyRiderStage, LIFECYCLE_STAGES, renderSms,
  type ActivationCheck, type LifecycleStage,
} from '@/lib/admin/activation-checks';
import { loadTemplateMap, renderBody, type SmsTemplate, type SmsEventKey } from '@/lib/sms/templates';

interface DriverRow {
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
  deposit_floor: string | number | null;
  location_updated_at: string | null;
  last_sign_in_at: string | null;
  area_names: string[] | null;
  has_profile_row: boolean;
  has_posts: boolean;
  account_status: string;
}

interface RiderRow {
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
  account_status: string;
}

function isValidStage(s: string | null): s is LifecycleStage {
  return s !== null && (LIFECYCLE_STAGES as string[]).includes(s);
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');
  const stageParam = req.nextUrl.searchParams.get('stage');
  const stageFilter: LifecycleStage | null = isValidStage(stageParam) ? stageParam : null;

  // Drivers: include EVERY driver in 'active' or 'pending_activation'.
  // pending_activation users have signed up but are awaiting admin approval —
  // they're prime activation candidates. suspended/banned stay excluded.
  // LEFT JOIN driver_profiles so users who haven't started their profile
  // (signup stage) still appear.
  const driverRows = await sql`
    SELECT
      u.id as user_id,
      dp.display_name,
      dp.handle,
      dp.phone,
      dp.area_slugs,
      dp.services_entire_market,
      dp.pricing,
      dp.thumbnail_url,
      dp.video_url,
      dp.vehicle_info,
      dp.profile_visible,
      dp.stripe_onboarding_complete,
      dp.deposit_floor,
      dp.location_updated_at,
      u.last_sign_in_at,
      u.account_status,
      ARRAY(
        SELECT ma.name FROM market_areas ma
        WHERE ma.slug = ANY(COALESCE(dp.area_slugs, ARRAY[]::text[]))
        ORDER BY ma.sort_order
      ) as area_names,
      (dp.user_id IS NOT NULL) as has_profile_row,
      EXISTS (SELECT 1 FROM hmu_posts hp WHERE hp.user_id = u.id) as has_posts
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.profile_type = 'driver'
      AND u.account_status IN ('active', 'pending_activation')
      AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
    ORDER BY u.created_at DESC
    LIMIT 500
  ` as unknown as DriverRow[];

  // Riders: same shape — LEFT JOIN profile, drop the rider_payment_methods
  // EXISTS gate, surface payment-method existence as a column for the
  // payment-setup stage classifier and the rider_payment_method check.
  // Includes pending_activation parallel to drivers above.
  const riderRows = await sql`
    SELECT
      u.id as user_id,
      rp.display_name,
      rp.phone,
      rp.thumbnail_url,
      rp.avatar_url,
      u.last_sign_in_at,
      u.account_status,
      (SELECT COUNT(*) FROM rides r WHERE r.rider_id = u.id AND r.status = 'completed') as rides_completed_count,
      (SELECT COUNT(*) FROM hmu_posts hp WHERE hp.user_id = u.id AND hp.post_type = 'rider_request') as ride_requests_count,
      EXISTS (SELECT 1 FROM rider_payment_methods rpm WHERE rpm.rider_id = u.id) as has_payment_method,
      (rp.user_id IS NOT NULL) as has_profile_row
    FROM users u
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.profile_type = 'rider'
      AND u.account_status IN ('active', 'pending_activation')
      AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
    ORDER BY u.last_sign_in_at DESC NULLS LAST, u.created_at DESC
    LIMIT 500
  ` as unknown as RiderRow[];

  // Pre-load every sms_templates row once; the activation page renders many
  // previews per request (drivers × checks + riders × checks) so a per-call
  // DB roundtrip would multiply Neon load by ~7500x at the 500-user cap.
  const templateMap = await loadTemplateMap();

  let drivers = driverRows.map(d => {
    const checks = computeDriverChecks(d);
    const coverage = classifyCoverage({
      servicesEntireMarket: d.services_entire_market === true,
      areaCount: d.area_slugs?.length ?? 0,
    });
    const stage = classifyDriverStage({
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
      deposit_floor: d.deposit_floor,
      last_sign_in_at: d.last_sign_in_at,
      has_posts: d.has_posts,
    });
    return {
      userId: d.user_id,
      displayName: d.display_name,
      handle: d.handle,
      phone: d.phone,
      areaNames: d.area_names ?? [],
      coverage,
      stage,
      accountStatus: d.account_status,
      lastSignInAt: d.last_sign_in_at,
      completeness: completenessPercent(checks),
      checks: serialize(checks, d.display_name, templateMap),
    };
  });

  let riders = riderRows.map(r => {
    const checks = computeRiderChecks({
      ...r,
      rides_completed_count: Number(r.rides_completed_count ?? 0),
      ride_requests_count: Number(r.ride_requests_count ?? 0),
    });
    const stage = classifyRiderStage({
      has_profile_row: r.has_profile_row,
      display_name: r.display_name,
      thumbnail_url: r.thumbnail_url,
      avatar_url: r.avatar_url,
      has_payment_method: r.has_payment_method,
      rides_completed_count: Number(r.rides_completed_count ?? 0),
      ride_requests_count: Number(r.ride_requests_count ?? 0),
      last_sign_in_at: r.last_sign_in_at,
    });
    return {
      userId: r.user_id,
      displayName: r.display_name,
      phone: r.phone,
      lastSignInAt: r.last_sign_in_at,
      ridesCompleted: Number(r.rides_completed_count ?? 0),
      rideRequests: Number(r.ride_requests_count ?? 0),
      stage,
      accountStatus: r.account_status,
      completeness: completenessPercent(checks),
      checks: serialize(checks, r.display_name, templateMap),
    };
  });

  // Counts BEFORE filter so the UI chips can show "Signup (12)" totals even
  // when the user is currently filtered to a different stage.
  const driverStageCounts = countStages(drivers.map(d => d.stage));
  const riderStageCounts = countStages(riders.map(r => r.stage));

  if (stageFilter) {
    drivers = drivers.filter(d => d.stage === stageFilter);
    riders = riders.filter(r => r.stage === stageFilter);
  }

  return NextResponse.json({
    drivers,
    riders,
    stageCounts: { drivers: driverStageCounts, riders: riderStageCounts },
  });
}

// Wire shape for the admin UI. `smsPreview` is the exact text that would
// ship — DB-rendered when the template row is present + enabled and supplies
// every {{var}} the check declares, otherwise the literal fallback rendered
// with renderSms. The client just displays smsPreview — no client-side
// substitution — so admin edits to /admin/sms-templates show up immediately.
function serialize(
  checks: ActivationCheck[],
  displayName: string | null,
  templateMap: Map<SmsEventKey, SmsTemplate>,
) {
  return checks.map(c => {
    let smsPreview = renderSms(c.smsTemplate, displayName);
    if (c.templateKey) {
      const tpl = templateMap.get(c.templateKey);
      if (tpl && tpl.enabled) {
        const rendered = renderBody(tpl.body, c.variables);
        if (rendered !== null) smsPreview = rendered;
      }
    }
    return {
      key: c.key,
      label: c.label,
      tone: c.tone,
      passed: c.passed,
      smsTemplate: c.smsTemplate, // kept for backwards compat with any consumer that hasn't migrated
      smsPreview,
    };
  });
}

function countStages(stages: LifecycleStage[]): Record<LifecycleStage, number> {
  const out: Record<LifecycleStage, number> = {
    signup: 0, profile_incomplete: 0, payment_setup: 0, ready_idle: 0, engaged: 0, dormant: 0,
  };
  for (const s of stages) out[s] += 1;
  return out;
}
