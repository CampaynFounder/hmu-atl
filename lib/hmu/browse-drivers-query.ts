// Shared query for the /rider/browse discovery surface.
// Called by both the initial server render (page.tsx) and the paginated
// /api/rider/browse/list endpoint, so eligibility + visibility logic stays
// enforced no matter how the cards get loaded.

import { sql } from '@/lib/db/client';
import { deriveVerificationStatus, type VerificationStatus } from '@/lib/driver/verification';

export interface BrowseRiderContext {
  /** Strict pref filter — `women_only` / `female` / `men_only` / `male` are the only
   * values that hard-filter; everything else (no_preference, prefer_*, null) is a
   * sort hint at most. */
  driverPreference: string | null;
  /** Explicit UI gender filter — overrides driverPreference when set. UI picks
   * 'female' / 'male' from the filter bar; passed through verbatim from the
   * client. Null means "fall back to driverPreference". */
  genderFilter?: 'female' | 'male' | null;
  /** Limit to drivers who have at least one piece of media — vehicle photo
   * or vibe video. Useful filter for riders who want to actually see the
   * driver before booking. */
  hasMediaOnly?: boolean;
  /** Optional rider coords for distance computation. When both are present,
   * each row gets a scalar distance_mi (driver's coords NEVER leak — only the
   * computed scalar). Stale rule: driver location older than 5min → null. */
  riderLat?: number | null;
  riderLng?: number | null;
}

export interface BrowseDriverRow {
  handle: string;
  displayName: string;
  areas: string[];
  minPrice: number;
  videoUrl: string | null;
  photoUrl: string | null;
  lgbtqFriendly: boolean;
  chillScore: number;
  isHmuFirst: boolean;
  enforceMinimum: boolean;
  fwu: boolean;
  acceptsCash: boolean;
  cashOnly: boolean;
  liveMessage: string | null;
  livePrice: number | null;
  serviceIcons: string[];
  vehicleSummary: { label: string; maxRiders: number | null } | null;
  hasVibeVideo: boolean;
  payoutReady: boolean;
  verificationStatus: VerificationStatus;
  /** Miles from the rider, computed server-side via Haversine. Null when
   * either side is missing a fresh location point. NEVER includes coords. */
  distanceMi: number | null;
}

// Driver locations older than this are treated as missing. Mirror this
// in the SQL below — sql tagged template can't parameterize an interval
// literal, so the value is duplicated. Bump both if you change it.
const STALE_LOCATION_MINUTES = 5;
void STALE_LOCATION_MINUTES;

export async function queryBrowseDrivers(
  rider: BrowseRiderContext,
  offset: number,
  limit: number,
): Promise<BrowseDriverRow[]> {
  // Explicit UI filter wins; profile preference is the fallback.
  const pref = rider.driverPreference;
  const profileStrict: 'female' | 'male' | null =
    pref === 'women_only' || pref === 'female' ? 'female' :
    pref === 'men_only'   || pref === 'male'   ? 'male' : null;
  const strictFilter: 'female' | 'male' | null =
    rider.genderFilter === 'female' || rider.genderFilter === 'male'
      ? rider.genderFilter
      : profileStrict;

  // Validate rider coords once — passing nonsense to the SQL would just yield
  // garbage distances, so coerce to null if either side is invalid.
  const riderLat = Number.isFinite(rider.riderLat) ? Number(rider.riderLat) : null;
  const riderLng = Number.isFinite(rider.riderLng) ? Number(rider.riderLng) : null;
  const haveRiderCoords = riderLat !== null && riderLng !== null
    && riderLat >= -90 && riderLat <= 90 && riderLng >= -180 && riderLng <= 180;

  const rows = await sql`
    SELECT dp.handle, dp.display_name, dp.areas, dp.pricing, dp.video_url,
           dp.vehicle_info, dp.lgbtq_friendly, dp.enforce_minimum, dp.fwu,
           dp.accepts_cash, dp.cash_only,
           dp.vibe_video_url, dp.payout_setup_complete,
           dp.first_name, dp.last_name,
           u.chill_score, u.tier,
           hp.time_window AS live_post,
           hp.price       AS live_price,
           (SELECT COALESCE(array_agg(DISTINCT COALESCE(smi.icon, dsm.custom_icon)), '{}')
            FROM driver_service_menu dsm
            LEFT JOIN service_menu_items smi ON dsm.item_id = smi.id
            WHERE dsm.driver_id = dp.user_id AND dsm.is_active = true
           ) AS service_icons,
           CASE
             WHEN ${haveRiderCoords}::boolean
              AND dp.current_lat IS NOT NULL
              AND dp.current_lng IS NOT NULL
              AND dp.location_updated_at > NOW() - INTERVAL '5 minutes'
             THEN
               -- Haversine, miles. Earth radius 3959mi.
               2 * 3959 * ASIN(SQRT(
                 POWER(SIN(RADIANS(dp.current_lat - ${riderLat ?? 0}::numeric) / 2), 2)
                 + COS(RADIANS(${riderLat ?? 0}::numeric)) * COS(RADIANS(dp.current_lat))
                   * POWER(SIN(RADIANS(dp.current_lng - ${riderLng ?? 0}::numeric) / 2), 2)
               ))
             ELSE NULL
           END AS distance_mi
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    LEFT JOIN hmu_posts hp ON hp.user_id = dp.user_id
      AND hp.post_type = 'driver_available'
      AND hp.status = 'active'
      AND hp.expires_at > NOW()
    WHERE dp.profile_visible = true
      AND u.account_status = 'active'
      AND (
        ${strictFilter}::text IS NULL
        OR (${strictFilter} = 'female' AND LOWER(dp.gender) IN ('female','woman'))
        OR (${strictFilter} = 'male'   AND LOWER(dp.gender) IN ('male','man'))
      )
      AND (
        NOT ${rider.hasMediaOnly === true}::boolean
        OR dp.video_url IS NOT NULL
        OR dp.vibe_video_url IS NOT NULL
        OR (dp.vehicle_info ? 'photo_url' AND dp.vehicle_info->>'photo_url' IS NOT NULL)
      )
    ORDER BY
      CASE WHEN hp.id IS NOT NULL THEN 0 ELSE 1 END,
      u.tier DESC, u.chill_score DESC, dp.handle ASC
    OFFSET ${offset}
    LIMIT  ${limit}
  `;

  return rows.map((d: Record<string, unknown>): BrowseDriverRow => {
    const livePost = d.live_post as Record<string, unknown> | null;
    const vi = d.vehicle_info as Record<string, unknown> | null;
    const vehicleSummary = (() => {
      if (!vi?.make) return null;
      const parts = [vi.year, vi.make, vi.model].filter(Boolean).join(' ');
      const maxR = Number(vi.max_adults || 0) + Number(vi.max_children || 0);
      return { label: parts, maxRiders: maxR || null };
    })();

    const verificationStatus = deriveVerificationStatus({
      firstName: d.first_name as string | null,
      lastName: d.last_name as string | null,
      licensePlate: (vi?.license_plate as string | null) ?? null,
    });

    const rawDistance = d.distance_mi;
    const distanceMi = rawDistance !== null && rawDistance !== undefined
      ? Number(rawDistance)
      : null;

    return {
      handle: d.handle as string,
      displayName: (d.display_name as string) || 'Driver',
      areas: Array.isArray(d.areas) ? (d.areas as string[]) : [],
      minPrice: Number((d.pricing as Record<string, unknown>)?.minimum ?? 0),
      videoUrl: (d.video_url as string) || null,
      photoUrl: (vi?.photo_url as string) || null,
      lgbtqFriendly: (d.lgbtq_friendly as boolean) || false,
      chillScore: Number(d.chill_score ?? 0),
      isHmuFirst: d.tier === 'hmu_first',
      enforceMinimum: d.enforce_minimum !== false,
      fwu: (d.fwu as boolean) || false,
      acceptsCash: (d.accepts_cash as boolean) || (d.cash_only as boolean) || false,
      cashOnly: (d.cash_only as boolean) || false,
      hasVibeVideo: !!d.vibe_video_url,
      payoutReady: !!d.payout_setup_complete,
      liveMessage: (livePost?.message as string) || null,
      livePrice: d.live_price ? Number(d.live_price) : null,
      serviceIcons: Array.isArray(d.service_icons)
        ? (d.service_icons as string[]).filter(Boolean)
        : [],
      vehicleSummary,
      verificationStatus,
      distanceMi: distanceMi !== null && Number.isFinite(distanceMi) ? distanceMi : null,
    };
  });
}
