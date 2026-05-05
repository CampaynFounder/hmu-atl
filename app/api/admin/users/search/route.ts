import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import type { AdminUserSearchResult } from '@/lib/db/types';

// Typed user search powering <UserSearchPicker>. Phase 0 of admin dashboards.
//
// GET /api/admin/users/search?q=...&market_id=...&profile_type=...&limit=25
//
// Returns a compact result list — display name, handle, phone, market label,
// account status, profile type. Respects the admin's admin_market_ids: if the
// admin is restricted, results are filtered to that allowlist regardless of
// the requested market_id.

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const marketId = searchParams.get('market_id');
  const profileType = searchParams.get('profile_type'); // 'driver' | 'rider' | null
  const limitParam = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT, 1), MAX_LIMIT);

  if (q.length < 2) {
    return NextResponse.json({ results: [] satisfies AdminUserSearchResult[] });
  }

  const pattern = `%${q}%`;
  const restrictedMarkets = !admin.is_super && Array.isArray(admin.admin_market_ids)
    ? admin.admin_market_ids
    : null;

  // The (?::type IS NULL OR ...) idiom lets one query handle optional filters
  // without branching into separate SQL strings. Casts are required because
  // Neon's HTTP client passes everything as text otherwise.
  const rows = await sql`
    SELECT
      u.id,
      u.clerk_id,
      u.profile_type,
      u.account_status,
      u.market_id,
      m.name AS market_label,
      COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS display_name,
      COALESCE(dp.handle, rp.handle) AS handle,
      COALESCE(dp.phone, rp.phone) AS phone
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.is_admin = false
      AND (
        dp.display_name ILIKE ${pattern}
        OR dp.first_name ILIKE ${pattern}
        OR dp.handle ILIKE ${pattern}
        OR dp.phone ILIKE ${pattern}
        OR rp.display_name ILIKE ${pattern}
        OR rp.first_name ILIKE ${pattern}
        OR rp.handle ILIKE ${pattern}
        OR rp.phone ILIKE ${pattern}
        OR u.clerk_id ILIKE ${pattern}
      )
      AND (${profileType}::text IS NULL OR u.profile_type = ${profileType})
      AND (${marketId}::uuid IS NULL OR u.market_id = ${marketId}::uuid)
      AND (${restrictedMarkets}::uuid[] IS NULL OR u.market_id = ANY(${restrictedMarkets}::uuid[]))
    ORDER BY
      -- exact handle/display match first, then recency
      (COALESCE(dp.handle, rp.handle) = ${q})::int DESC,
      u.created_at DESC
    LIMIT ${limit}
  `;

  const results: AdminUserSearchResult[] = rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    clerk_id: r.clerk_id as string,
    profile_type: r.profile_type as AdminUserSearchResult['profile_type'],
    display_name: (r.display_name as string | null) ?? null,
    handle: (r.handle as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    market_id: (r.market_id as string | null) ?? null,
    market_label: (r.market_label as string | null) ?? null,
    account_status: r.account_status as AdminUserSearchResult['account_status'],
  }));

  return NextResponse.json({ results });
}
