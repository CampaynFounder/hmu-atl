import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { listFbGroups, createFbGroup, type FbGroupInput } from '@/lib/db/fb-groups';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const marketSlug = req.nextUrl.searchParams.get('market') || undefined;
  const groups = await listFbGroups(marketSlug);
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const body = await req.json() as Partial<FbGroupInput>;
  if (!body.market_slug || !body.name || !body.url) {
    return NextResponse.json({ error: 'market_slug, name, url required' }, { status: 400 });
  }
  const group = await createFbGroup(body as FbGroupInput, admin.id);
  await logAdminAction(admin.id, 'fb_group.create', 'driver_fb_group', group.id, { name: group.name, market_slug: group.market_slug });
  return NextResponse.json({ group });
}
