import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

// Mirrors MARKET_CENTERS in middleware.ts — keep in sync when adding markets
const MARKET_CENTERS = [
  { slug: 'atl',   lat: 33.7490, lng: -84.3880, radiusMiles: 60  },
  { slug: 'nola',  lat: 29.9511, lng: -90.0715, radiusMiles: 50  },
  { slug: 'aug',   lat: 33.4735, lng: -82.0105, radiusMiles: 30  },
  { slug: 'macon', lat: 32.8407, lng: -83.6324, radiusMiles: 30  },
  { slug: 'sav',   lat: 32.0809, lng: -81.0912, radiusMiles: 30  },
  { slug: 'vld',   lat: 30.8327, lng: -83.2785, radiusMiles: 25  },
  { slug: 'csg',   lat: 32.4610, lng: -84.9877, radiusMiles: 25  },
  { slug: 'tpa',   lat: 27.9506, lng: -82.4572, radiusMiles: 40  },
  { slug: 'mia',   lat: 26.0000, lng: -80.2000, radiusMiles: 40  },
  { slug: 'orl',   lat: 28.5383, lng: -81.3792, radiusMiles: 35  },
  { slug: 'mem',   lat: 35.1495, lng: -90.0490, radiusMiles: 40  },
  { slug: 'bna',   lat: 36.1627, lng: -86.7816, radiusMiles: 40  },
  { slug: 'knx',   lat: 35.9606, lng: -83.9207, radiusMiles: 30  },
  { slug: 'cha',   lat: 35.0456, lng: -85.3097, radiusMiles: 30  },
  { slug: 'bhm',   lat: 33.5186, lng: -86.8104, radiusMiles: 35  },
  { slug: 'mgm',   lat: 32.3668, lng: -86.3000, radiusMiles: 30  },
  { slug: 'hou',   lat: 29.7604, lng: -95.3698, radiusMiles: 50  },
  { slug: 'dfw',   lat: 32.7767, lng: -96.7970, radiusMiles: 50  },
  { slug: 'clt',   lat: 35.2271, lng: -80.8431, radiusMiles: 35  },
  { slug: 'chi',   lat: 41.8781, lng: -87.6298, radiusMiles: 45  },
  { slug: 'dtw',   lat: 42.3314, lng: -83.0458, radiusMiles: 40  },
  { slug: 'stl',   lat: 38.6270, lng: -90.1994, radiusMiles: 40  },
  { slug: 'cin',   lat: 39.1031, lng: -84.5120, radiusMiles: 35  },
] as const;

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '');
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '');
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  // Find nearest market within its radius
  let bestSlug: string | null = null;
  let minDist = Infinity;
  for (const m of MARKET_CENTERS) {
    const d = haversineDistanceMiles(lat, lng, m.lat, m.lng);
    if (d < m.radiusMiles && d < minDist) { minDist = d; bestSlug = m.slug; }
  }

  if (!bestSlug) {
    void captureWaitlist(userId, null);
    return NextResponse.json({ isActive: false, marketSlug: null, displayName: 'Your area' });
  }

  // Check is_active in markets table
  const rows = await sql`
    SELECT slug, display_name, is_active FROM markets WHERE slug = ${bestSlug} LIMIT 1
  `.catch(() => [] as unknown[]);

  if (!rows.length) {
    // Market slug found by geo but not yet in DB — default to active.
    // "not seeded" ≠ "not launched"; only an explicit is_active=false blocks users.
    return NextResponse.json({
      isActive: true,
      marketSlug: bestSlug,
      displayName: bestSlug.toUpperCase(),
    });
  }

  const market = rows[0] as { slug: string; display_name: string; is_active: boolean };

  if (!market.is_active) {
    void captureWaitlist(userId, bestSlug);
    return NextResponse.json({
      isActive: false,
      marketSlug: bestSlug,
      displayName: market.display_name,
    });
  }

  return NextResponse.json({
    isActive: true,
    marketSlug: bestSlug,
    displayName: market.display_name,
  });
}

async function captureWaitlist(userId: string, marketSlug: string | null) {
  try {
    const userRows = await sql`SELECT phone FROM users WHERE clerk_id = ${userId} LIMIT 1`;
    if (!userRows.length) return;
    const phone = (userRows[0] as { phone: string | null }).phone;
    if (!phone) return;
    await sql`
      INSERT INTO market_waitlist (phone, market_slug, source)
      VALUES (${phone}, ${marketSlug}, 'mobile_auth')
      ON CONFLICT (phone) DO NOTHING
    `;
  } catch {}
}
