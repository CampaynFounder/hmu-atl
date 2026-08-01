// GET  /api/admin/seed-ads  — list all seed advertisements
// POST /api/admin/seed-ads  — create one
// Super-admin only.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { listSeedAds, createSeedAd, type AdSurface } from '@/lib/db/seed-ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SURFACES: AdSurface[] = ['rider_browse', 'driver_browse', 'both'];

export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const ads = await listSeedAds();
  return NextResponse.json({ ads });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const surface = SURFACES.includes(body.surface as AdSurface) ? (body.surface as AdSurface) : 'both';
  const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
  if (!headline) return NextResponse.json({ error: 'headline is required' }, { status: 400 });

  const mediaType = body.media_type === 'photo' || body.media_type === 'video' ? body.media_type : null;

  const ad = await createSeedAd({
    surface,
    market_id: typeof body.market_id === 'string' && body.market_id ? body.market_id : null,
    headline,
    body: typeof body.body === 'string' ? body.body : null,
    cta_label: typeof body.cta_label === 'string' ? body.cta_label : null,
    cta_url: typeof body.cta_url === 'string' ? body.cta_url : null,
    media_url: typeof body.media_url === 'string' ? body.media_url : null,
    poster_url: typeof body.poster_url === 'string' ? body.poster_url : null,
    media_type: mediaType,
    frequency: typeof body.frequency === 'number' && body.frequency >= 1 ? Math.floor(body.frequency) : 6,
    sort_order: typeof body.sort_order === 'number' ? Math.floor(body.sort_order) : 0,
    is_active: body.is_active !== false,
  }, admin.id);

  await logAdminAction(admin.id, 'seed_ad.create', 'seed_advertisement', ad.id, { surface, headline });
  return NextResponse.json({ ad }, { status: 201 });
}
