import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const ALLOWED_STATUSES = ['setup', 'soft_launch', 'live', 'paused'] as const;
type MarketStatus = typeof ALLOWED_STATUSES[number];

function isStatus(v: unknown): v is MarketStatus {
  return typeof v === 'string' && (ALLOWED_STATUSES as readonly string[]).includes(v);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.markets.edit')) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nextStatus = body.status;

  if (!isStatus(nextStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const existing = await sql`SELECT id, slug, status FROM markets WHERE id = ${id} LIMIT 1`;
  if (!existing.length) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 });
  }
  const prevStatus = existing[0].status as string;

  // Stamp launch_date the first time a market goes live (soft_launch or live).
  // Otherwise preserve existing value via COALESCE.
  const shouldStampLaunch = (nextStatus === 'soft_launch' || nextStatus === 'live')
    && prevStatus === 'setup';

  const updated = shouldStampLaunch
    ? await sql`
        UPDATE markets
           SET status = ${nextStatus}, launch_date = NOW(), updated_at = NOW()
         WHERE id = ${id}
     RETURNING id, slug, name, status, launch_date
      `
    : await sql`
        UPDATE markets
           SET status = ${nextStatus}, updated_at = NOW()
         WHERE id = ${id}
     RETURNING id, slug, name, status, launch_date
      `;

  await logAdminAction(
    admin.id,
    'market.status_change',
    'market',
    id,
    { slug: existing[0].slug, from: prevStatus, to: nextStatus },
  );

  return NextResponse.json({ market: updated[0] });
}
