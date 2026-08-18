// GET  /api/admin/demo-accounts — list all admin-provisioned demo accounts
// POST /api/admin/demo-accounts — provision a new one { phone, role, marketId?, label? }
// Super-admin only. Reuses the same Clerk-verified-phone + active-Neon-row shape
// as the reviewer flow, but for arbitrary unique phones with a per-account code.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { listDemoAccounts, provisionDemoAccount } from '@/lib/demo/registry';
import { resolveMarketBySlug } from '@/lib/markets/resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const accounts = await listDemoAccounts();
  return NextResponse.json({ accounts });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const role = body.role === 'driver' ? 'driver' : body.role === 'rider' ? 'rider' : null;
  if (!role) return NextResponse.json({ error: "role must be 'driver' or 'rider'" }, { status: 400 });
  const phone = typeof body.phone === 'string' ? body.phone : '';
  if (!phone.trim()) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

  // Accept a market id directly, or a slug (mobile admin only knows slugs).
  let marketId = typeof body.marketId === 'string' && body.marketId ? body.marketId : null;
  if (!marketId && typeof body.marketSlug === 'string' && body.marketSlug) {
    const m = await resolveMarketBySlug(body.marketSlug);
    marketId = m?.market_id ?? null;
  }

  try {
    const account = await provisionDemoAccount({
      phone,
      role,
      marketId,
      label: typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null,
      createdBy: admin.id,
    });
    await logAdminAction(admin.id, 'demo_account.provision', 'demo_account', account.id, { phone: account.phone, role });
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to provision' }, { status: 400 });
  }
}
