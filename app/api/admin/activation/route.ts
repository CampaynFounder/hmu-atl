// GET /api/admin/activation — payment-ready users with completeness data.
// Returns drivers + riders separately, each row carrying the area chips,
// coverage bucket, completeness %, and the list of failed checks so the UI
// can render the gap chips and the Nudge button without further round-trips.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import {
  computeDriverChecks, computeRiderChecks, classifyCoverage, completenessPercent,
  type ActivationCheck,
} from '@/lib/admin/activation-checks';

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
  last_sign_in_at: string | null;
  area_names: string[] | null;
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
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');

  // Drivers: payment-ready = stripe_onboarding_complete. Pull area names so
  // the UI can render readable chips instead of slugs.
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
      u.last_sign_in_at,
      ARRAY(
        SELECT ma.name FROM market_areas ma
        WHERE ma.slug = ANY(COALESCE(dp.area_slugs, ARRAY[]::text[]))
        ORDER BY ma.sort_order
      ) as area_names
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE COALESCE(dp.stripe_onboarding_complete, false) = true
      AND u.account_status = 'active'
      AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
    ORDER BY u.created_at DESC
    LIMIT 500
  ` as unknown as DriverRow[];

  // Riders: payment-ready = at least one row in rider_payment_methods.
  // Pull lifetime activity so we can score "has booked anything" without an
  // N+1 from the client.
  const riderRows = await sql`
    SELECT
      u.id as user_id,
      rp.display_name,
      rp.phone,
      rp.thumbnail_url,
      rp.avatar_url,
      u.last_sign_in_at,
      (SELECT COUNT(*) FROM rides r WHERE r.rider_id = u.id AND r.status = 'completed') as rides_completed_count,
      (SELECT COUNT(*) FROM hmu_posts hp WHERE hp.user_id = u.id AND hp.post_type = 'rider_request') as ride_requests_count
    FROM users u
    JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE EXISTS (SELECT 1 FROM rider_payment_methods rpm WHERE rpm.rider_id = u.id)
      AND u.account_status = 'active'
      AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId})
    ORDER BY u.last_sign_in_at DESC NULLS LAST, u.created_at DESC
    LIMIT 500
  ` as unknown as RiderRow[];

  const drivers = driverRows.map(d => {
    const checks = computeDriverChecks(d);
    const coverage = classifyCoverage({
      servicesEntireMarket: d.services_entire_market === true,
      areaCount: d.area_slugs?.length ?? 0,
    });
    return {
      userId: d.user_id,
      displayName: d.display_name,
      handle: d.handle,
      phone: d.phone,
      areaNames: d.area_names ?? [],
      coverage,
      lastSignInAt: d.last_sign_in_at,
      completeness: completenessPercent(checks),
      checks: serialize(checks),
    };
  });

  const riders = riderRows.map(r => {
    const checks = computeRiderChecks({
      ...r,
      rides_completed_count: Number(r.rides_completed_count ?? 0),
      ride_requests_count: Number(r.ride_requests_count ?? 0),
    });
    return {
      userId: r.user_id,
      displayName: r.display_name,
      phone: r.phone,
      lastSignInAt: r.last_sign_in_at,
      ridesCompleted: Number(r.rides_completed_count ?? 0),
      rideRequests: Number(r.ride_requests_count ?? 0),
      completeness: completenessPercent(checks),
      checks: serialize(checks),
    };
  });

  return NextResponse.json({ drivers, riders });
}

function serialize(checks: ActivationCheck[]) {
  return checks.map(c => ({
    key: c.key,
    label: c.label,
    passed: c.passed,
    smsTemplate: c.smsTemplate,
  }));
}
