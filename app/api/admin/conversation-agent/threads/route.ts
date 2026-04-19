import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { listThreads, getThreadStats, type ThreadStatus } from '@/lib/conversation/threads';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const url = req.nextUrl;
  const statusParam = url.searchParams.get('status') as ThreadStatus | null;
  const limit = Number(url.searchParams.get('limit') || '50');
  const offset = Number(url.searchParams.get('offset') || '0');

  const { threads, total } = await listThreads({
    status: statusParam ?? undefined,
    limit,
    offset,
  });
  const stats = await getThreadStats();

  return NextResponse.json({ threads, total, stats });
}
