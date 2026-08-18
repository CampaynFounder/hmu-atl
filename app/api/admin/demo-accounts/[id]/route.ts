// PATCH  /api/admin/demo-accounts/[id]  — rotate the bypass code { action: 'rotate' }
// DELETE /api/admin/demo-accounts/[id]  — remove the demo account (frees the phone)
// Super-admin only.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { rotateDemoOtp, deleteDemoAccount } from '@/lib/demo/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== 'rotate') {
    return NextResponse.json({ error: "action must be 'rotate'" }, { status: 400 });
  }
  const code = await rotateDemoOtp(id);
  if (!code) return NextResponse.json({ error: 'Demo account not found' }, { status: 404 });
  await logAdminAction(admin.id, 'demo_account.rotate_code', 'demo_account', id);
  return NextResponse.json({ otp_code: code });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const { id } = await params;

  const ok = await deleteDemoAccount(id);
  if (!ok) return NextResponse.json({ error: 'Demo account not found' }, { status: 404 });
  await logAdminAction(admin.id, 'demo_account.delete', 'demo_account', id);
  return NextResponse.json({ ok: true });
}
