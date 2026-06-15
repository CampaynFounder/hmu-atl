// GET/PATCH /api/admin/booking-types
// Per-market rollout switches for the four booking flows, backed by the
// boolean columns on `markets` (direct_enabled, blast_enabled, down_bad_enabled,
// delivery_enabled). Super-admin only — controls what riders can book per market.
//
//   GET  ?marketId=<uuid>                       → { marketId, slug, name, flags }
//   PATCH { marketId, type, enabled }           → flips one column
//     type ∈ 'direct' | 'blast' | 'downBad' | 'delivery'

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { BOOKING_TYPE_COLUMN, type BookingType } from '@/lib/markets/booking-types';

export const runtime = 'nodejs';

function isBookingType(v: unknown): v is BookingType {
  return typeof v === 'string' && v in BOOKING_TYPE_COLUMN;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const marketId = new URL(req.url).searchParams.get('marketId');
  if (!marketId) return NextResponse.json({ error: 'marketId required' }, { status: 400 });

  const rows = await sql`
    SELECT id, slug, name, direct_enabled, blast_enabled, down_bad_enabled, delivery_enabled
    FROM markets WHERE id = ${marketId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'Market not found' }, { status: 404 });

  const m = rows[0] as {
    id: string; slug: string; name: string;
    direct_enabled: boolean; blast_enabled: boolean;
    down_bad_enabled: boolean; delivery_enabled: boolean;
  };
  return NextResponse.json({
    marketId: m.id,
    slug: m.slug,
    name: m.name,
    flags: {
      direct: m.direct_enabled,
      blast: m.blast_enabled,
      downBad: m.down_bad_enabled,
      delivery: m.delivery_enabled,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    marketId?: string; type?: unknown; enabled?: unknown;
  };
  if (!body.marketId || typeof body.enabled !== 'boolean' || !isBookingType(body.type)) {
    return NextResponse.json(
      { error: 'marketId (string), type (direct|blast|downBad|delivery), enabled (boolean) required' },
      { status: 400 },
    );
  }
  const { marketId, type, enabled } = body;

  // Column is allowlisted via BOOKING_TYPE_COLUMN, but tagged-template SQL can't
  // interpolate identifiers — so each type maps to a static UPDATE.
  let updated: unknown[];
  switch (type) {
    case 'direct':
      updated = await sql`UPDATE markets SET direct_enabled = ${enabled} WHERE id = ${marketId} RETURNING id`;
      break;
    case 'blast':
      updated = await sql`UPDATE markets SET blast_enabled = ${enabled} WHERE id = ${marketId} RETURNING id`;
      break;
    case 'downBad':
      updated = await sql`UPDATE markets SET down_bad_enabled = ${enabled} WHERE id = ${marketId} RETURNING id`;
      break;
    case 'delivery':
      updated = await sql`UPDATE markets SET delivery_enabled = ${enabled} WHERE id = ${marketId} RETURNING id`;
      break;
  }
  if (!updated || !updated.length) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 });
  }

  await logAdminAction(admin.id, 'booking_type_toggle', 'markets', marketId, { type, enabled });
  return NextResponse.json({ ok: true });
}
