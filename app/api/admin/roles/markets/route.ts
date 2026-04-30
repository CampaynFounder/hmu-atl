// PUT /api/admin/roles/markets — set the market allowlist for an admin user.
// Body: { user_id: UUID, market_ids: UUID[] | null }
//   null  → unrestricted (super-style, sees every market)
//   []    → no markets (locked out of market-scoped surfaces)
//   [...] → explicit allowlist
//
// Super-only — market scoping is a privilege-management primitive, not
// something the role-management permission grants on its own. Audit-logged.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  // Super-only. Note this uses the EFFECTIVE is_super, so a super admin
  // currently previewing a lower role can't reassign markets — they have
  // to exit preview first. This is consistent with the middleware's
  // read-only guard during preview.
  if (!admin.is_super) return unauthorizedResponse();

  const body = await request.json();
  const { user_id, market_ids } = body as { user_id?: string; market_ids?: string[] | null };
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  // Validate the array shape — null is allowed (unrestricted), but anything
  // present must be a UUID-shaped string array.
  if (market_ids !== null && market_ids !== undefined && !Array.isArray(market_ids)) {
    return NextResponse.json({ error: 'market_ids must be an array or null' }, { status: 400 });
  }

  // Encode as a Postgres UUID[] literal. Same approach as roles permissions.
  // Empty array → '{}' which Neon parses as an empty UUID[].
  const literal = Array.isArray(market_ids)
    ? `{${market_ids.map((id) => `"${id}"`).join(',')}}`
    : null;

  await sql`
    UPDATE users
    SET admin_market_ids = ${literal}::UUID[], updated_at = NOW()
    WHERE id = ${user_id} AND is_admin = true
  `;

  await logAdminAction(admin.id, 'admin_markets_updated', 'user', user_id, { market_ids });

  return NextResponse.json({ ok: true });
}
