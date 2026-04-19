import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { getStateFresh, updateState, type MaintenanceStateInput } from '@/lib/maintenance';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const state = await getStateFresh();
  return NextResponse.json({ state });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const body = await req.json() as Partial<MaintenanceStateInput>;

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 });
  }
  if (typeof body.title !== 'string' || body.title.length === 0) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (typeof body.body !== 'string' || body.body.length === 0) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }

  const input: MaintenanceStateInput = {
    enabled: body.enabled,
    title: body.title,
    body: body.body,
    expected_return_at: body.expected_return_at ?? null,
  };
  const state = await updateState(input, admin.id);

  await logAdminAction(admin.id, 'maintenance.update', 'maintenance_mode', '1', {
    enabled: state.enabled,
    title: state.title,
    expected_return_at: state.expected_return_at ? new Date(state.expected_return_at).toISOString() : null,
  });

  return NextResponse.json({ state });
}
