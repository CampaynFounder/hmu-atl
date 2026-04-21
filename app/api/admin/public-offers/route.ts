import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { clearTierCardCache } from '@/lib/cms/tier-card-resolver';

// GET — list every public offer with market + stage join for display
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT
      po.id,
      po.market_id,
      m.slug AS market_slug,
      po.tier,
      po.funnel_stage_slug,
      po.before_price_cents,
      po.after_price_cents,
      po.label_text,
      po.linked_promotion_id,
      po.effective_from,
      po.effective_to,
      po.is_active,
      po.created_at,
      po.updated_at
    FROM public_offers po
    LEFT JOIN markets m ON m.id = po.market_id
    ORDER BY po.tier, po.funnel_stage_slug NULLS FIRST, po.created_at DESC
  `;

  return NextResponse.json({
    offers: rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      marketId: r.market_id ?? null,
      marketSlug: r.market_slug ?? null,
      tier: r.tier,
      funnelStageSlug: r.funnel_stage_slug ?? null,
      beforePriceCents: Number(r.before_price_cents),
      afterPriceCents: Number(r.after_price_cents),
      labelText: r.label_text ?? null,
      linkedPromotionId: r.linked_promotion_id ?? null,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to ?? null,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

// POST — create a public offer. Validates tier, prices, and stage.
// Market scoping: not required for MVP (ATL only). Pass marketSlug if provided.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json() as {
    tier?: string;
    funnelStageSlug?: string | null;
    marketSlug?: string | null;
    beforePriceCents?: number;
    afterPriceCents?: number;
    labelText?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    isActive?: boolean;
  };

  const tier = body.tier;
  if (!tier || !['free', 'hmu_first'].includes(tier)) {
    return NextResponse.json({ error: 'tier must be "free" or "hmu_first"' }, { status: 400 });
  }

  const beforeCents = Number(body.beforePriceCents);
  const afterCents = Number(body.afterPriceCents);
  if (!Number.isFinite(beforeCents) || beforeCents < 0) {
    return NextResponse.json({ error: 'beforePriceCents must be a non-negative number' }, { status: 400 });
  }
  if (!Number.isFinite(afterCents) || afterCents < 0) {
    return NextResponse.json({ error: 'afterPriceCents must be a non-negative number' }, { status: 400 });
  }

  // Resolve optional market slug to id
  let marketId: string | null = null;
  if (body.marketSlug) {
    const m = await sql`SELECT id FROM markets WHERE slug = ${body.marketSlug} LIMIT 1`;
    if (!m.length) return NextResponse.json({ error: `Unknown market slug: ${body.marketSlug}` }, { status: 400 });
    marketId = (m[0] as { id: string }).id;
  }

  // Validate funnel stage slug if provided
  const stage = body.funnelStageSlug ?? null;
  if (stage) {
    const s = await sql`SELECT slug FROM funnel_stages WHERE slug = ${stage} LIMIT 1`;
    if (!s.length) return NextResponse.json({ error: `Unknown funnel stage: ${stage}` }, { status: 400 });
  }

  // If activating on create, the partial unique index will reject duplicates.
  const isActive = body.isActive === true;

  try {
    const result = await sql`
      INSERT INTO public_offers (
        market_id, tier, funnel_stage_slug,
        before_price_cents, after_price_cents, label_text,
        effective_from, effective_to, is_active,
        created_by, updated_by
      ) VALUES (
        ${marketId}, ${tier}, ${stage},
        ${beforeCents}, ${afterCents}, ${body.labelText ?? null},
        ${body.effectiveFrom ?? new Date().toISOString()},
        ${body.effectiveTo ?? null},
        ${isActive},
        ${admin.id}, ${admin.id}
      )
      RETURNING id
    `;
    const id = (result[0] as { id: string }).id;
    await logAdminAction(admin.id, 'public_offer.create', 'public_offer', id, { tier, stage, isActive });
    clearTierCardCache();
    return NextResponse.json({ id, status: 'created' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('idx_public_offers_unique_active')) {
      return NextResponse.json({
        error: 'Another active offer already exists for this (market, tier, funnel stage). Deactivate it first.',
      }, { status: 409 });
    }
    console.error('[public-offers POST] Insert failed:', err);
    return NextResponse.json({ error: 'Failed to create public offer' }, { status: 500 });
  }
}
