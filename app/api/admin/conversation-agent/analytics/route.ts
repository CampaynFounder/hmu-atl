import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';
import { getAnalytics } from '@/lib/conversation/analytics';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.convagent.view')) return unauthorizedResponse();

  const rangeDays = Number(req.nextUrl.searchParams.get('range') || '30');
  const snapshot = await getAnalytics(rangeDays);
  return NextResponse.json(snapshot);
}
