// GET /api/markets/discover?lat=X&lng=Y
// Public endpoint (no auth) — used by the /join onboarding page to detect
// the rider's market and show a live driver count before they sign up.
// Rate-limited at 30/hour per IP. Returns no PII — count only.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

const MARKET_CENTERS = [
  { slug: 'atl',   name: 'Atlanta',       lat: 33.7490, lng: -84.3880, radiusMiles: 60 },
  { slug: 'nola',  name: 'New Orleans',   lat: 29.9511, lng: -90.0715, radiusMiles: 50 },
  { slug: 'aug',   name: 'Augusta',       lat: 33.4735, lng: -82.0105, radiusMiles: 30 },
  { slug: 'macon', name: 'Macon',         lat: 32.8407, lng: -83.6324, radiusMiles: 30 },
  { slug: 'sav',   name: 'Savannah',      lat: 32.0809, lng: -81.0912, radiusMiles: 30 },
  { slug: 'vld',   name: 'Valdosta',      lat: 30.8327, lng: -83.2785, radiusMiles: 25 },
  { slug: 'csg',   name: 'Columbus',      lat: 32.4610, lng: -84.9877, radiusMiles: 25 },
  { slug: 'tpa',   name: 'Tampa',         lat: 27.9506, lng: -82.4572, radiusMiles: 40 },
  { slug: 'mia',   name: 'Miami',         lat: 26.0000, lng: -80.2000, radiusMiles: 40 },
  { slug: 'orl',   name: 'Orlando',       lat: 28.5383, lng: -81.3792, radiusMiles: 35 },
  { slug: 'mem',   name: 'Memphis',       lat: 35.1495, lng: -90.0490, radiusMiles: 40 },
  { slug: 'bna',   name: 'Nashville',     lat: 36.1627, lng: -86.7816, radiusMiles: 40 },
  { slug: 'knx',   name: 'Knoxville',     lat: 35.9606, lng: -83.9207, radiusMiles: 30 },
  { slug: 'cha',   name: 'Chattanooga',   lat: 35.0456, lng: -85.3097, radiusMiles: 30 },
  { slug: 'bhm',   name: 'Birmingham',    lat: 33.5186, lng: -86.8104, radiusMiles: 35 },
  { slug: 'mgm',   name: 'Montgomery',    lat: 32.3668, lng: -86.3000, radiusMiles: 30 },
  { slug: 'hou',   name: 'Houston',       lat: 29.7604, lng: -95.3698, radiusMiles: 50 },
  { slug: 'dfw',   name: 'Dallas',        lat: 32.7767, lng: -96.7970, radiusMiles: 50 },
  { slug: 'clt',   name: 'Charlotte',     lat: 35.2271, lng: -80.8431, radiusMiles: 35 },
  { slug: 'chi',   name: 'Chicago',       lat: 41.8781, lng: -87.6298, radiusMiles: 45 },
  { slug: 'dtw',   name: 'Detroit',       lat: 42.3314, lng: -83.0458, radiusMiles: 40 },
  { slug: 'stl',   name: 'St. Louis',     lat: 38.6270, lng: -90.1994, radiusMiles: 40 },
  { slug: 'cin',   name: 'Cincinnati',    lat: 39.1031, lng: -84.5120, radiusMiles: 35 },
] as const;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Simple in-memory rate limiter — resets on cold start, good enough for a
// low-traffic public endpoint. A full Upstash check would be overkill here.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

export async function GET(req: NextRequest) {
  if (!checkRateLimit(clientIp(req))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '');
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  // Find the closest active market within its radius
  let match: typeof MARKET_CENTERS[number] | null = null;
  let minDist = Infinity;
  for (const m of MARKET_CENTERS) {
    const d = haversine(lat, lng, m.lat, m.lng);
    if (d < m.radiusMiles && d < minDist) { minDist = d; match = m; }
  }

  if (!match) {
    return NextResponse.json({ isActive: false, slug: null, name: null, driverCount: 0 });
  }

  // Count drivers who are active and payout-ready in this market.
  // No PII is returned — count only.
  let driverCount = 0;
  try {
    const rows = await sql`
      SELECT COUNT(DISTINCT dp.user_id)::int AS count
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE u.market_id = (SELECT id FROM markets WHERE slug = ${match.slug} LIMIT 1)
        AND u.account_status = 'active'
        AND dp.profile_visible = true
        AND dp.payout_setup_complete = true
    `;
    driverCount = (rows[0] as { count: number })?.count ?? 0;
  } catch {
    // Non-fatal — proceed without count
  }

  // Bucket the count to avoid false precision while still being accurate
  // enough to feel real. Caps at "100+" for large markets.
  const displayCount = driverCount >= 100
    ? '100+'
    : driverCount >= 20
    ? `${Math.floor(driverCount / 10) * 10}+`
    : String(driverCount);

  return NextResponse.json(
    { isActive: true, slug: match.slug, name: match.name, driverCount, displayCount },
    { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' } },
  );
}
