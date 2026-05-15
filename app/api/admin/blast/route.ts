// GET /api/admin/blast — paginated blast index for /admin/blast.
// Owned by Stream D per contract §8. Permission: monitor.blasts.
// Gate 2.2 stub — implementation lands in Stream D.

import { NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  // Permission slug per contract §8: monitor.blasts. Until Stream D registers
  // it in lib/admin/route-permissions.ts, super admins still pass via
  // hasPermission's is_super short-circuit.
  if (!hasPermission(admin, 'monitor.blasts.view')) return unauthorizedResponse();
  return NextResponse.json(
    { error: 'not_implemented_pending_stream_d' },
    { status: 501 },
  );
}
