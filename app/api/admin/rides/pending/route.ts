// GET /api/admin/rides/pending — Unmatched rider requests (hmu_posts active, not yet matched)
// Used by the live ops map to show ride requests awaiting a driver as purple pins.
// Coordinates are approximate: market center + deterministic UUID-based jitter so
// pins spread across a ~3-mile radius rather than stacking on one point.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// Spread pins within ±0.03° lat / ±0.04° lng of market center (≈ 2 miles).
// Uses first 6 hex chars of the UUID for a stable, reproducible offset so
// the pin doesn't jump between refreshes.
function uuidJitter(id: string, scale: number): number {
  const hex = id.replace(/-/g, '').slice(0, 6);
  const n = parseInt(hex, 16); // 0 – 16777215
  return (n / 16777215 - 0.5) * scale;
}

function approxLat(id: string, center: number): number {
  return center + uuidJitter(id, 0.06);
}

function approxLng(id: string, center: number): number {
  // Use the *next* 6 hex chars for an independent offset
  const hex = id.replace(/-/g, '').slice(6, 12);
  const n = parseInt(hex, 16);
  return center + (n / 16777215 - 0.5) * 0.08;
}

const ATL_CENTER = { lat: 33.749, lng: -84.388 };

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || '100'), 200);

  const rows = marketId
    ? await sql`
        SELECT
          p.id, p.post_type, p.areas, p.pickup_area_slug, p.dropoff_area_slug,
          p.price, p.time_window, p.created_at, p.expires_at,
          COALESCE(rp.display_name, rp.first_name) AS rider_name,
          rp.handle AS rider_handle,
          m.center_lat AS market_lat, m.center_lng AS market_lng
        FROM hmu_posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        LEFT JOIN markets m ON m.id = p.market_id
        WHERE p.status = 'active'
          AND p.post_type IN ('rider_seeking_driver', 'rider_request')
          AND p.market_id = ${marketId}
          AND (p.expires_at IS NULL OR p.expires_at > NOW())
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          p.id, p.post_type, p.areas, p.pickup_area_slug, p.dropoff_area_slug,
          p.price, p.time_window, p.created_at, p.expires_at,
          COALESCE(rp.display_name, rp.first_name) AS rider_name,
          rp.handle AS rider_handle,
          m.center_lat AS market_lat, m.center_lng AS market_lng
        FROM hmu_posts p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        LEFT JOIN markets m ON m.id = p.market_id
        WHERE p.status = 'active'
          AND p.post_type IN ('rider_seeking_driver', 'rider_request')
          AND (p.expires_at IS NULL OR p.expires_at > NOW())
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `;

  return NextResponse.json({
    requests: (rows as Record<string, unknown>[]).map((r) => {
      const centerLat = r.market_lat ? Number(r.market_lat) : ATL_CENTER.lat;
      const centerLng = r.market_lng ? Number(r.market_lng) : ATL_CENTER.lng;
      return {
        id: r.id as string,
        riderName: (r.rider_name as string) ?? 'Rider',
        riderHandle: (r.rider_handle as string) ?? null,
        areas: Array.isArray(r.areas) ? r.areas : [],
        pickupAreaSlug: (r.pickup_area_slug as string) ?? null,
        dropoffAreaSlug: (r.dropoff_area_slug as string) ?? null,
        price: r.price ? Number(r.price) : null,
        createdAt: r.created_at as string,
        expiresAt: (r.expires_at as string) ?? null,
        approxLat: approxLat(r.id as string, centerLat),
        approxLng: approxLng(r.id as string, centerLng),
      };
    }),
  });
}
