// GET /api/admin/suspect-usage — rollup of users whose behavior tripped a rate-limit
// or self-booking guard in the last N days. Feeds /admin/suspect-usage page.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { getSuspectUsageSummary } from '@/lib/admin/suspect-events';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const daysParam = Number(req.nextUrl.searchParams.get('days') || '7');
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 7;

  const users = await getSuspectUsageSummary(days);
  return NextResponse.json({ days, users });
}
