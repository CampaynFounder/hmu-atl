// /api/admin/dashboards/preview
//
// Live grid preview while building. Takes the in-progress column list
// (?fields=k1,k2,...) and returns up to 5 rows. Super or
// admin.dashboards.edit; non-edit roles don't need a preview.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, hasPermission } from '@/lib/admin/helpers';
import { fetchUserGridRows } from '@/lib/admin/dashboards/runtime';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super && !hasPermission(admin, 'admin.dashboards.edit')) {
    return NextResponse.json({ error: 'admin.dashboards.edit required' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const fieldKeys = (sp.get('fields') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  const result = await fetchUserGridRows({
    admin,
    fieldKeys,
    filters: {
      profileType: sp.get('profileType'),
      limit: 5,
      offset: 0,
    },
    adminActiveMarketId: sp.get('marketId'),
  });

  return NextResponse.json({ fieldKeys, rows: result.rows, total: result.total });
}
