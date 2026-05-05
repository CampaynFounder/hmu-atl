// /api/admin/roles/[id]/dashboards
//   GET — list every dashboard with a `granted: boolean` flag for this role.
//         Super only. Used by the role editor to show a pickable list.
//   PUT — replace the role's dashboard grants. Body: { dashboard_ids: string[] }
//         Super only. Always-visible builtins (default-user-profile) are
//         filtered out — they bypass the grant table anyway.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { ensureBuiltinsReconciled } from '@/lib/admin/dashboards/builtins';
import { DASHBOARD_AUDIT, DASHBOARD_AUDIT_TARGET } from '@/lib/admin/dashboards/audit-events';

const putBody = z.object({
  dashboard_ids: z.array(z.string().uuid()).max(200),
});

async function loadRole(id: string) {
  const [row] = await sql`SELECT id, slug, label, is_super FROM admin_roles WHERE id = ${id} LIMIT 1`;
  return row ?? null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return NextResponse.json({ error: 'super only' }, { status: 403 });
  const { id } = await ctx.params;

  await ensureBuiltinsReconciled();

  const role = await loadRole(id);
  if (!role) return NextResponse.json({ error: 'role not found' }, { status: 404 });

  const rows = await sql`
    SELECT d.id, d.slug, d.label, d.description, d.scope, d.is_builtin,
           (g.role_id IS NOT NULL) AS granted
    FROM admin_dashboards d
    LEFT JOIN admin_dashboard_role_grants g
      ON g.dashboard_id = d.id AND g.role_id = ${id}
    ORDER BY d.is_builtin DESC, d.label ASC
  `;

  return NextResponse.json({
    role: { id: role.id, slug: role.slug, label: role.label, is_super: role.is_super },
    dashboards: rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      slug: r.slug as string,
      label: r.label as string,
      description: (r.description as string | null) ?? null,
      scope: r.scope as string,
      is_builtin: r.is_builtin as boolean,
      granted: r.granted as boolean,
    })),
  });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return NextResponse.json({ error: 'super only' }, { status: 403 });
  const { id } = await ctx.params;

  const role = await loadRole(id);
  if (!role) return NextResponse.json({ error: 'role not found' }, { status: 404 });
  // Super_admin never needs grants — they bypass.
  if (role.is_super) {
    return NextResponse.json({ error: 'super_admin role bypasses grants; nothing to set' }, { status: 400 });
  }

  let parsed: z.infer<typeof putBody>;
  try {
    parsed = putBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid body', details: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  // Validate every id exists.
  if (parsed.dashboard_ids.length > 0) {
    const found = await sql`
      SELECT id FROM admin_dashboards WHERE id = ANY(${parsed.dashboard_ids}::uuid[])
    `;
    if (found.length !== parsed.dashboard_ids.length) {
      return NextResponse.json({ error: 'one or more dashboard_ids not found' }, { status: 400 });
    }
  }

  await sql`DELETE FROM admin_dashboard_role_grants WHERE role_id = ${id}`;
  for (const dashboardId of parsed.dashboard_ids) {
    await sql`
      INSERT INTO admin_dashboard_role_grants (dashboard_id, role_id, granted_by)
      VALUES (${dashboardId}, ${id}, ${admin.id})
      ON CONFLICT (dashboard_id, role_id) DO NOTHING
    `;
  }

  await logAdminAction(admin.id, DASHBOARD_AUDIT.GRANTS_UPDATED, DASHBOARD_AUDIT_TARGET.ROLE, id, {
    role_slug: role.slug,
    dashboard_count: parsed.dashboard_ids.length,
  });

  return NextResponse.json({ ok: true, count: parsed.dashboard_ids.length });
}
