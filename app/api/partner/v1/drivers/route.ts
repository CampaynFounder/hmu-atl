// GET /api/partner/v1/drivers — partner-authenticated driver discovery.
//
// Thin wrapper over the same queryBrowseDrivers used by the rider browse
// surface, so partners see exactly the eligibility/visibility the rider site
// enforces. Auth is API key + HMAC signature (see lib/partner/auth.ts).
//
// NOTE: this lists drivers but does not gate on driver partner-booking consent
// (accept_partner_bookings) — listing is the same public data the rider site
// already shows. Consent is enforced at booking time (Phase 2).

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePartner } from '@/lib/partner/auth';
import { queryBrowseDrivers } from '@/lib/hmu/browse-drivers-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 30;

function parseCoord(v: string | null, kind: 'lat' | 'lng'): number | null {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (kind === 'lat' && (n < -90 || n > 90)) return null;
  if (kind === 'lng' && (n < -180 || n > 180)) return null;
  return n;
}

export async function GET(req: NextRequest) {
  // GET has no body; the signature is computed over the empty string.
  const auth = await authenticatePartner(req, '', 'drivers:read');
  if (!auth.ok) return auth.res;

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 12)),
  );

  const riderLat = parseCoord(req.nextUrl.searchParams.get('lat'), 'lat');
  const riderLng = parseCoord(req.nextUrl.searchParams.get('lng'), 'lng');
  const rawGender = req.nextUrl.searchParams.get('gender');
  const genderFilter: 'female' | 'male' | null =
    rawGender === 'female' || rawGender === 'male' ? rawGender : null;
  const areaFilter = req.nextUrl.searchParams.get('area') || null;
  const rawMaxPrice = req.nextUrl.searchParams.get('maxPrice');
  const maxPrice = rawMaxPrice ? Math.max(0, Number(rawMaxPrice)) : null;

  try {
    const drivers = await queryBrowseDrivers(
      {
        driverPreference: null,
        genderFilter,
        hasMediaOnly: false,
        fwuOnly: false,
        areaFilter,
        maxPrice,
        minAcceptanceRate: null,
        riderLat,
        riderLng,
      },
      offset,
      limit,
    );

    return NextResponse.json({ drivers, hasMore: drivers.length === limit });
  } catch (e) {
    console.error('[partner/v1/drivers] query failed', e);
    return NextResponse.json(
      { error: 'unavailable', message: 'Driver listing is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
