import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { listFeatureFlags } from '@/lib/feature-flags';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const flags = await listFeatureFlags();
  return NextResponse.json({ flags });
}
