// GET /api/admin/blast/[id] — per-blast observability detail view.
// Returns { blast, candidates, events, summary } per contract §8.
// Owned by Stream D. Permission: monitor.blasts.
// Gate 2.2 stub — implementation lands in Stream D.

import { NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'monitor.blasts.view')) return unauthorizedResponse();
  return NextResponse.json(
    { error: 'not_implemented_pending_stream_d' },
    { status: 501 },
  );
}
