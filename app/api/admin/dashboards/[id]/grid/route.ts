// /api/admin/dashboards/[id]/grid
//
// Fetch one page of rows for a user_grid dashboard. Filters come from the
// query string; column field_keys come from the dashboard config.
//
// Query params:
//   profileType   driver | rider           (optional)
//   status        active | pending_activation | suspended | banned
//   marketId      uuid                     (optional)
//   q             free-text search
//   limit, offset numbers; clamped server-side

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import {
  loadDashboardById,
  canViewDashboard,
  fetchUserGridRows,
} from '@/lib/admin/dashboards/runtime';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const { id } = await ctx.params;

  const bundle = await loadDashboardById(id);
  if (!bundle) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (bundle.dashboard.scope !== 'user_grid') {
    return NextResponse.json({ error: 'dashboard is not user_grid scope' }, { status: 400 });
  }

  const ok = await canViewDashboard(admin, bundle.dashboard);
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // For grids, sections are flattened — concat all field_keys in section order.
  const fieldKeys = bundle.sections.flatMap((s) => s.field_keys);

  const sp = req.nextUrl.searchParams;
  const result = await fetchUserGridRows({
    admin,
    fieldKeys,
    filters: {
      profileType: sp.get('profileType'),
      status: sp.get('status'),
      marketId: sp.get('marketId'),
      search: sp.get('q'),
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
      offset: sp.get('offset') ? Number(sp.get('offset')) : undefined,
    },
    adminActiveMarketId: sp.get('marketId'),
  });

  return NextResponse.json({
    fieldKeys,
    rows: result.rows,
    total: result.total,
  });
}
