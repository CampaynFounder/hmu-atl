import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { clearTierCardCache } from '@/lib/cms/tier-card-resolver';

interface RouteCtx { params: Promise<{ id: string }> }

// PATCH — edit fields and/or toggle is_active.
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await ctx.params;
  const body = await req.json() as {
    beforePriceCents?: number;
    afterPriceCents?: number;
    labelText?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    isActive?: boolean;
  };

  // Fetch current row
  const existing = await sql`SELECT * FROM public_offers WHERE id = ${id} LIMIT 1`;
  if (!existing.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const current = existing[0] as Record<string, unknown>;

  const beforeCents = body.beforePriceCents !== undefined ? Number(body.beforePriceCents) : Number(current.before_price_cents);
  const afterCents = body.afterPriceCents !== undefined ? Number(body.afterPriceCents) : Number(current.after_price_cents);
  if (!Number.isFinite(beforeCents) || beforeCents < 0) {
    return NextResponse.json({ error: 'beforePriceCents must be non-negative' }, { status: 400 });
  }
  if (!Number.isFinite(afterCents) || afterCents < 0) {
    return NextResponse.json({ error: 'afterPriceCents must be non-negative' }, { status: 400 });
  }

  const label = body.labelText !== undefined ? body.labelText : (current.label_text as string | null);
  const effectiveFrom = body.effectiveFrom ?? current.effective_from;
  const effectiveTo = body.effectiveTo !== undefined ? body.effectiveTo : (current.effective_to as string | null);
  const isActive = body.isActive !== undefined ? body.isActive : (current.is_active as boolean);

  try {
    await sql`
      UPDATE public_offers SET
        before_price_cents = ${beforeCents},
        after_price_cents = ${afterCents},
        label_text = ${label},
        effective_from = ${effectiveFrom},
        effective_to = ${effectiveTo},
        is_active = ${isActive},
        updated_by = ${admin.id},
        updated_at = NOW()
      WHERE id = ${id}
    `;
    await logAdminAction(admin.id, 'public_offer.update', 'public_offer', id, {
      beforeCents, afterCents, label, isActive,
    });
    clearTierCardCache();
    return NextResponse.json({ status: 'updated' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('idx_public_offers_unique_active')) {
      return NextResponse.json({
        error: 'Another active offer already exists for this (market, tier, funnel stage). Deactivate it first.',
      }, { status: 409 });
    }
    console.error('[public-offers PATCH] Update failed:', err);
    return NextResponse.json({ error: 'Failed to update public offer' }, { status: 500 });
  }
}

// DELETE — hard delete. Safe because no other table FKs this (linked_promotion_id
// is in the opposite direction) and no production data relies on historical rows.
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await ctx.params;
  await sql`DELETE FROM public_offers WHERE id = ${id}`;
  await logAdminAction(admin.id, 'public_offer.delete', 'public_offer', id);
  clearTierCardCache();
  return NextResponse.json({ status: 'deleted' });
}
