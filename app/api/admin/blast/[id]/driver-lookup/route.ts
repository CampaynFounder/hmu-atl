// GET /api/admin/blast/[id]/driver-lookup?q=<name>
// Returns matching drivers + their exact status for this blast.
// For drivers not in the pool, runs pre-pool eligibility checks against the
// blast's parameters to explain why they were excluded.
// Permission: monitor.blasts.view.

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORTCODE_RE = /^[A-Z0-9]{4,12}$/;

// Inline haversine — avoids importing the geo module in a nodejs runtime route.
function distanceMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface PrePoolCheck {
  label: string;
  passed: boolean;
  detail: string;
}

function computePrePoolChecks(
  driver: Record<string, unknown>,
  blastCreatedAt: Date,
  pickupLat: number | null,
  pickupLng: number | null,
): PrePoolCheck[] {
  const checks: PrePoolCheck[] = [];

  // 1. Account status
  const status = driver.account_status as string;
  checks.push({
    label: 'Account active',
    passed: status === 'active',
    detail: status === 'active' ? 'Active' : `Status: ${status || 'unknown'}`,
  });

  // 2. GPS on file
  const hasLoc = driver.current_lat != null && driver.current_lng != null;
  checks.push({
    label: 'GPS location on file',
    passed: hasLoc,
    detail: hasLoc ? 'Location recorded' : 'No GPS — driver must open the app with location enabled',
  });

  // 3. Location freshness at blast time (default stale threshold: 5 min)
  const STALE_MINS = 5;
  if (driver.location_updated_at) {
    const updatedAt = new Date(driver.location_updated_at as string);
    const minsBefore = (blastCreatedAt.getTime() - updatedAt.getTime()) / 60_000;
    const stale = minsBefore > STALE_MINS;
    checks.push({
      label: 'Location fresh at blast time',
      passed: !stale,
      detail: stale
        ? `GPS was ${Math.round(minsBefore)}min old at blast time (must be < ${STALE_MINS}min) — driver wasn't active in the app`
        : `GPS updated ${Math.round(Math.max(0, minsBefore))}min before blast`,
    });
  } else {
    checks.push({
      label: 'Location fresh at blast time',
      passed: false,
      detail: 'No location timestamp recorded',
    });
  }

  // 4. Within pickup radius (initial 10mi radius from matching engine)
  const INITIAL_RADIUS_MI = 10;
  if (pickupLat != null && pickupLng != null && hasLoc) {
    const mi = distanceMi(pickupLat, pickupLng, Number(driver.current_lat), Number(driver.current_lng));
    checks.push({
      label: 'Within initial pickup radius',
      passed: mi <= INITIAL_RADIUS_MI,
      detail: mi <= INITIAL_RADIUS_MI
        ? `${mi.toFixed(1)}mi from pickup (within ${INITIAL_RADIUS_MI}mi)`
        : `${mi.toFixed(1)}mi from pickup (initial radius: ${INITIAL_RADIUS_MI}mi — blast may expand to 20mi if pool is small)`,
    });
  }

  // 5. Chill score (default min: 50)
  const MIN_CHILL = 50;
  const chill = Number(driver.chill_score ?? 100);
  checks.push({
    label: 'Chill score',
    passed: chill >= MIN_CHILL,
    detail: `${chill} ${chill >= MIN_CHILL ? '✓' : `(minimum is ${MIN_CHILL})`}`,
  });

  // 6. Recent sign-in at blast time (default: 72h)
  const MAX_SIGNIN_HOURS = 72;
  if (driver.last_active) {
    const lastActive = new Date(driver.last_active as string);
    const hoursBefore = (blastCreatedAt.getTime() - lastActive.getTime()) / 3_600_000;
    checks.push({
      label: 'Recently active',
      passed: hoursBefore <= MAX_SIGNIN_HOURS,
      detail: hoursBefore <= MAX_SIGNIN_HOURS
        ? `Active ${Math.round(hoursBefore)}h before blast`
        : `Last active ${Math.round(hoursBefore)}h before blast (must be within ${MAX_SIGNIN_HOURS}h)`,
    });
  }

  // 7. Payout method
  const payoutReady = !!(driver.payout_setup_complete || driver.stripe_onboarding_complete);
  checks.push({
    label: 'Payout account ready',
    passed: payoutReady,
    detail: payoutReady ? 'Bank/card connected' : 'No payout method — driver must connect bank account in app',
  });

  return checks;
}

interface Params { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'monitor.blasts.view')) return unauthorizedResponse();

  const { id: rawId } = await params;
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ drivers: [] });

  // Resolve shortcode
  let blastId = rawId;
  if (!UUID_RE.test(rawId)) {
    if (!SHORTCODE_RE.test(rawId.toUpperCase())) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
    }
    const resolved = await sql`
      SELECT id FROM hmu_posts
      WHERE post_type = 'blast' AND areas && ARRAY[${`shortcode:${rawId.toUpperCase()}`}]
      LIMIT 1
    `;
    if (!resolved.length) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    blastId = (resolved[0] as { id: string }).id;
  }

  // Load blast details — try with pickup coords first, fall back without
  let blastRow: Record<string, unknown> | null = null;
  try {
    const rows = await sql`
      SELECT id, user_id, market_id, created_at, pickup_lat, pickup_lng
      FROM hmu_posts WHERE id = ${blastId} AND post_type = 'blast' LIMIT 1
    `;
    if (rows.length) blastRow = rows[0] as Record<string, unknown>;
  } catch {
    const rows = await sql`
      SELECT id, user_id, market_id, created_at
      FROM hmu_posts WHERE id = ${blastId} AND post_type = 'blast' LIMIT 1
    `;
    if (rows.length) blastRow = rows[0] as Record<string, unknown>;
  }
  if (!blastRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const blastCreatedAt = new Date(blastRow.created_at as string);
  const pickupLat = blastRow.pickup_lat != null ? Number(blastRow.pickup_lat) : null;
  const pickupLng = blastRow.pickup_lng != null ? Number(blastRow.pickup_lng) : null;

  // Search drivers by name / handle
  const pattern = `%${q}%`;
  const driverRows = await sql`
    SELECT
      dp.user_id,
      COALESCE(dp.display_name, dp.first_name, 'Unknown') AS display_name,
      dp.handle, dp.thumbnail_url,
      dp.current_lat, dp.current_lng, dp.location_updated_at,
      dp.stripe_onboarding_complete, dp.payout_setup_complete,
      u.account_status, u.chill_score, u.last_active, u.completed_rides
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE u.profile_type = 'driver'
      AND (
        dp.display_name ILIKE ${pattern}
        OR dp.first_name  ILIKE ${pattern}
        OR dp.last_name   ILIKE ${pattern}
        OR dp.handle      ILIKE ${pattern}
      )
    ORDER BY dp.display_name NULLS LAST
    LIMIT 10
  `;

  type FilterResult = { filter?: string; passed?: boolean; value?: unknown; threshold?: unknown };

  const results = await Promise.all(
    (driverRows as Record<string, unknown>[]).map(async (row) => {
      const driverId = row.user_id as string;

      // Check blast_driver_targets (notified pool)
      let target: Record<string, unknown> | null = null;
      try {
        const tRows = await sql`
          SELECT match_score, score_breakdown, notified_at,
                 hmu_at, counter_price, passed_at, selected_at, pull_up_at
          FROM blast_driver_targets
          WHERE blast_id = ${blastId} AND driver_id = ${driverId}
          LIMIT 1
        `;
        if (tRows.length) target = tRows[0] as Record<string, unknown>;
      } catch { /* table absent */ }

      if (target) {
        const response =
          target.pull_up_at    ? 'pull_up'  :
          target.selected_at   ? 'selected' :
          target.hmu_at        ? 'hmu'      :
          target.counter_price != null ? 'counter' :
          target.passed_at     ? 'pass'     :
          'pending';
        return {
          driver: {
            id: driverId,
            displayName: row.display_name as string,
            handle: row.handle as string | null,
            avatarUrl: row.thumbnail_url as string | null,
          },
          status: 'notified' as const,
          response,
          score: Number(target.match_score),
          scoreBreakdown: (target.score_breakdown ?? {}) as Record<string, number>,
          filterResults: [] as FilterResult[],
          prePoolChecks: [] as PrePoolCheck[],
        };
      }

      // Check blast_match_log (scored but possibly filtered)
      let candidate: Record<string, unknown> | null = null;
      try {
        const cRows = await sql`
          SELECT score, filter_results, was_notified
          FROM blast_match_log
          WHERE blast_id = ${blastId} AND driver_id = ${driverId}
          LIMIT 1
        `;
        if (cRows.length) candidate = cRows[0] as Record<string, unknown>;
      } catch { /* table absent */ }

      if (candidate) {
        const filterResults = (candidate.filter_results ?? []) as FilterResult[];
        const failedFilters = filterResults.filter((f) => f.passed === false);
        return {
          driver: {
            id: driverId,
            displayName: row.display_name as string,
            handle: row.handle as string | null,
            avatarUrl: row.thumbnail_url as string | null,
          },
          status: (failedFilters.length > 0 ? 'in_pool_filtered' : 'in_pool_not_notified') as 'in_pool_filtered' | 'in_pool_not_notified',
          response: null,
          score: candidate.score != null ? Number(candidate.score) : null,
          scoreBreakdown: {} as Record<string, number>,
          filterResults,
          prePoolChecks: [] as PrePoolCheck[],
        };
      }

      // Not in pool — explain why via current profile state
      return {
        driver: {
          id: driverId,
          displayName: row.display_name as string,
          handle: row.handle as string | null,
          avatarUrl: row.thumbnail_url as string | null,
        },
        status: 'not_in_pool' as const,
        response: null,
        score: null,
        scoreBreakdown: {} as Record<string, number>,
        filterResults: [] as FilterResult[],
        prePoolChecks: computePrePoolChecks(row, blastCreatedAt, pickupLat, pickupLng),
      };
    }),
  );

  return NextResponse.json({ drivers: results });
}
