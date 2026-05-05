// /api/admin/dashboards/[id]/data
//
// Run all sections + fields for a dashboard and return their results. Used
// by the builder preview and any client that wants to re-fetch a dashboard
// without rerendering the whole page (e.g. periodic refresh).
//
// Query params:
//   userId   — required for user_detail dashboards
//   marketId — overrides the active market for admin_active fields
//
// Note: returned `results` is an array of sections; each section carries its
// fields. Field values include raw data only — renderers live server-side.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import {
  loadDashboardById,
  canViewDashboard,
  fetchDashboardSections,
} from '@/lib/admin/dashboards/runtime';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const { id } = await ctx.params;

  const bundle = await loadDashboardById(id);
  if (!bundle) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ok = await canViewDashboard(admin, bundle.dashboard);
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const userId = req.nextUrl.searchParams.get('userId');
  const marketId = req.nextUrl.searchParams.get('marketId');

  if (bundle.dashboard.scope === 'user_detail' && !userId) {
    return NextResponse.json({ error: 'userId is required for user_detail dashboards' }, { status: 400 });
  }

  let viewedUserMarketId: string | null = null;
  if (userId) {
    const [row] = await sql`SELECT market_id FROM users WHERE id = ${userId} LIMIT 1`;
    viewedUserMarketId = (row?.market_id as string | null) ?? null;
  }

  const results = await fetchDashboardSections(bundle.sections, {
    admin,
    viewedUserId: userId ?? undefined,
    viewedUserMarketId,
    adminActiveMarketId: marketId,
  });

  return NextResponse.json({ results });
}
