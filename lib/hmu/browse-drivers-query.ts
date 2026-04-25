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
}

export async function queryBrowseDrivers(
  rider: BrowseRiderContext,
  offset: number,
  limit: number,
): Promise<BrowseDriverRow[]> {
  const pref = rider.driverPreference;
  const strictFilter: 'female' | 'male' | null =
    pref === 'women_only' || pref === 'female' ? 'female' :
    pref === 'men_only'   || pref === 'male'   ? 'male' : null;

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
           ) AS service_icons
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
    };
  });
}
