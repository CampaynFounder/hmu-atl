import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { updateFbGroup, deleteFbGroup, type FbGroupInput } from '@/lib/db/fb-groups';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const { id } = await params;
  const body = await req.json() as Partial<FbGroupInput>;
  if (!body.market_slug || !body.name || !body.url) {
    return NextResponse.json({ error: 'market_slug, name, url required' }, { status: 400 });
  }
  const group = await updateFbGroup(id, body as FbGroupInput, admin.id);
  if (!group) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await logAdminAction(admin.id, 'fb_group.update', 'driver_fb_group', id, { name: group.name });
  return NextResponse.json({ group });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const { id } = await params;
  const ok = await deleteFbGroup(id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await logAdminAction(admin.id, 'fb_group.delete', 'driver_fb_group', id, {});
  return NextResponse.json({ ok: true });
}
