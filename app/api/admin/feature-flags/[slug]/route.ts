import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { updateFeatureFlag, type FlagUpdate } from '@/lib/feature-flags';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.flags.edit')) return unauthorizedResponse();

  const { slug } = await params;
  const body = await req.json() as Partial<FlagUpdate>;

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 });
  }
  if (typeof body.rollout_percentage !== 'number' || body.rollout_percentage < 0 || body.rollout_percentage > 100) {
    return NextResponse.json({ error: 'rollout_percentage must be 0-100' }, { status: 400 });
  }
  if (body.markets !== null && !Array.isArray(body.markets)) {
    return NextResponse.json({ error: 'markets must be array or null' }, { status: 400 });
  }

  const update: FlagUpdate = {
    enabled: body.enabled,
    rollout_percentage: body.rollout_percentage,
    markets: body.markets ?? null,
  };

  const flag = await updateFeatureFlag(slug, update, admin.id);
  await logAdminAction(admin.id, 'feature_flag.update', 'feature_flag', slug, { ...update });

  return NextResponse.json({ flag });
}
