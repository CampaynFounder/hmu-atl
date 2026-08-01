// PATCH  /api/admin/seed-ads/[id] — update a seed advertisement
// DELETE /api/admin/seed-ads/[id] — delete one (+ best-effort R2 cleanup)
// Super-admin only.

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { updateSeedAd, deleteSeedAd, type AdSurface, type UpsertSeedAdParams } from '@/lib/db/seed-ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const R2_PUBLIC_URL =
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
  'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';

const SURFACES: AdSurface[] = ['rider_browse', 'driver_browse', 'both'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<UpsertSeedAdParams> = {};
  if (SURFACES.includes(body.surface as AdSurface)) patch.surface = body.surface as AdSurface;
  if ('market_id' in body) patch.market_id = typeof body.market_id === 'string' && body.market_id ? body.market_id : null;
  if (typeof body.headline === 'string') patch.headline = body.headline.trim();
  if ('body' in body) patch.body = typeof body.body === 'string' ? body.body : null;
  if ('cta_label' in body) patch.cta_label = typeof body.cta_label === 'string' ? body.cta_label : null;
  if ('cta_url' in body) patch.cta_url = typeof body.cta_url === 'string' ? body.cta_url : null;
  if ('media_url' in body) patch.media_url = typeof body.media_url === 'string' ? body.media_url : null;
  if ('poster_url' in body) patch.poster_url = typeof body.poster_url === 'string' ? body.poster_url : null;
  if (body.media_type === 'photo' || body.media_type === 'video' || body.media_type === null) {
    patch.media_type = body.media_type as 'photo' | 'video' | null;
  }
  if (typeof body.frequency === 'number' && body.frequency >= 1) patch.frequency = Math.floor(body.frequency);
  if (typeof body.sort_order === 'number') patch.sort_order = Math.floor(body.sort_order);
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;

  const ad = await updateSeedAd(id, patch);
  if (!ad) return NextResponse.json({ error: 'Ad not found' }, { status: 404 });

  await logAdminAction(admin.id, 'seed_ad.update', 'seed_advertisement', id, patch as Record<string, unknown>);
  return NextResponse.json({ ad });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const { id } = await params;

  const removed = await deleteSeedAd(id);
  if (!removed) return NextResponse.json({ error: 'Ad not found' }, { status: 404 });

  try {
    const { env } = getCloudflareContext();
    const bucket = (env as Record<string, unknown>).MEDIA_BUCKET as
      | { delete: (key: string) => Promise<unknown> }
      | undefined;
    if (bucket) {
      const urls = [removed.media_url, removed.poster_url].filter((u): u is string => !!u);
      const keys = urls.filter((u) => u.startsWith(R2_PUBLIC_URL)).map((u) => u.slice(R2_PUBLIC_URL.length + 1));
      await Promise.all(keys.map((k) => bucket.delete(k).catch(() => {})));
    }
  } catch { /* best-effort */ }

  await logAdminAction(admin.id, 'seed_ad.delete', 'seed_advertisement', id);
  return NextResponse.json({ ok: true });
}
