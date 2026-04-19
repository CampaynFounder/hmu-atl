import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { listWaitlist, getWaitlistStats } from '@/lib/maintenance';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const [entries, stats] = await Promise.all([listWaitlist(), getWaitlistStats()]);
  return NextResponse.json({ entries, stats });
}
