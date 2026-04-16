import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, hasPermission, logAdminAction } from '@/lib/admin/helpers';

// POST: Approve or reject a pending_approval variant
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.funnel.publish')) return unauthorizedResponse();

  const { id: variantId } = await params;
  const body = await request.json();
  const { action, notes } = body;

  if (!action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  if (action === 'approve') {
    await sql`
      UPDATE content_variants
      SET status = 'published',
          published_at = NOW(),
          approved_by = ${admin.id},
          updated_at = NOW()
      WHERE id = ${variantId} AND status = 'pending_approval'
    `;
    await logAdminAction(admin.id, 'cms_variant_approved', 'content_variant', variantId, { notes });
  } else {
    await sql`
      UPDATE content_variants
      SET status = 'draft',
          approved_by = NULL,
          approval_requested_by = NULL,
          approval_requested_at = NULL,
          updated_at = NOW()
      WHERE id = ${variantId} AND status = 'pending_approval'
    `;
    await logAdminAction(admin.id, 'cms_variant_rejected', 'content_variant', variantId, { notes });
  }

  return NextResponse.json({ ok: true, action });
}
