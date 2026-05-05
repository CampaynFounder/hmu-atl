// /api/admin/marketing/notes/search?q=...&scope=mine|all
//   Returns archived + active matches.
//   - Regular admin: only their own notes (active + archived). scope is ignored.
//   - Super admin: scope=mine (default) → own only; scope=all → every admin.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

interface SearchHit {
  id: string;
  admin_id: string;
  admin_name: string;
  body: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const scope = url.searchParams.get('scope') === 'all' && admin.is_super ? 'all' : 'mine';

  if (q.length < 2) {
    // Pre-empt useless full-table scans for empty / 1-char queries; the
    // frontend uses this for typeahead so a noisy first keystroke shouldn't
    // page through every row.
    return NextResponse.json({ hits: [] });
  }

  // Trigram + ILIKE handles short tokens fine via the GIN index. Fall back
  // pattern: %q% — gin_trgm_ops makes this fast even at scale.
  const pattern = `%${q}%`;

  const rows = scope === 'all'
    ? (await sql`
        SELECT n.id, n.admin_id, n.body, n.created_at, n.updated_at, n.archived_at,
               COALESCE(dp.display_name, rp.display_name, u.clerk_id) AS admin_name
        FROM admin_notes n
        JOIN users u ON u.id = n.admin_id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE n.body ILIKE ${pattern}
          AND n.target_user_id IS NULL
        ORDER BY n.updated_at DESC
        LIMIT 50
      `) as SearchHit[]
    : (await sql`
        SELECT n.id, n.admin_id, n.body, n.created_at, n.updated_at, n.archived_at,
               COALESCE(dp.display_name, rp.display_name, u.clerk_id) AS admin_name
        FROM admin_notes n
        JOIN users u ON u.id = n.admin_id
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE n.admin_id = ${admin.id}
          AND n.body ILIKE ${pattern}
          AND n.target_user_id IS NULL
        ORDER BY n.updated_at DESC
        LIMIT 50
      `) as SearchHit[];

  return NextResponse.json({ hits: rows });
}
