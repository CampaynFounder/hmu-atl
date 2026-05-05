// /api/admin/dashboards/[id]
//   GET    → dashboard + sections + grants. Any admin with grant (or super).
//   PATCH  → super-only update. Sections + grants are full-replace
//            (delete-all + reinsert) — simpler than per-row diffs and the
//            lists are tiny.
//   DELETE → super only. Blocked when is_builtin=true.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import {
  loadDashboardById,
  canViewDashboard,
} from '@/lib/admin/dashboards/runtime';
import { getField } from '@/lib/admin/dashboards/fields/registry';
import { DASHBOARD_AUDIT, DASHBOARD_AUDIT_TARGET } from '@/lib/admin/dashboards/audit-events';

const sectionSchema = z.object({
  label: z.string().max(80).nullable().optional(),
  field_keys: z.array(z.string().min(1)).min(1).max(40),
  col_span: z.number().int().min(1).max(12).optional(),
});

const patchBody = z.object({
  label: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  market_id: z.string().uuid().nullable().optional(),
  sections: z.array(sectionSchema).min(1).max(20).optional(),
  role_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const { id } = await ctx.params;

  const bundle = await loadDashboardById(id);
  if (!bundle) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const ok = await canViewDashboard(admin, bundle.dashboard);
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const grantRows = await sql`
    SELECT g.role_id, ar.slug AS role_slug, ar.label AS role_label
    FROM admin_dashboard_role_grants g
    JOIN admin_roles ar ON ar.id = g.role_id
    WHERE g.dashboard_id = ${id}
    ORDER BY ar.label
  `;

  return NextResponse.json({
    dashboard: bundle.dashboard,
    sections: bundle.sections,
    grants: grantRows,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return NextResponse.json({ error: 'super only' }, { status: 403 });
  const { id } = await ctx.params;

  const existing = await loadDashboardById(id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let parsed: z.infer<typeof patchBody>;
  try {
    parsed = patchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: 'invalid body', details: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  if (parsed.sections) {
    for (const s of parsed.sections) {
      for (const key of s.field_keys) {
        if (!getField(key)) {
          return NextResponse.json({ error: `unknown field key: ${key}` }, { status: 400 });
        }
      }
    }
  }

  await sql`
    UPDATE admin_dashboards SET
      label = COALESCE(${parsed.label ?? null}, label),
      description = CASE WHEN ${parsed.description !== undefined} THEN ${parsed.description ?? null} ELSE description END,
      market_id = CASE WHEN ${parsed.market_id !== undefined} THEN ${parsed.market_id ?? null}::uuid ELSE market_id END,
      updated_at = NOW()
    WHERE id = ${id}
  `;

  if (parsed.sections) {
    await sql`DELETE FROM admin_dashboard_blocks WHERE dashboard_id = ${id}`;
    for (let i = 0; i < parsed.sections.length; i++) {
      const s = parsed.sections[i];
      await sql`
        INSERT INTO admin_dashboard_blocks (dashboard_id, section_type, label, field_keys, sort_order, col_span)
        VALUES (${id}, 'fields', ${s.label ?? null}, ${s.field_keys}::text[], ${i}, ${s.col_span ?? 12})
      `;
    }
  }

  if (parsed.role_ids) {
    await sql`DELETE FROM admin_dashboard_role_grants WHERE dashboard_id = ${id}`;
    for (const role_id of parsed.role_ids) {
      await sql`
        INSERT INTO admin_dashboard_role_grants (dashboard_id, role_id, granted_by)
        VALUES (${id}, ${role_id}, ${admin.id})
      `;
    }
  }

  await logAdminAction(admin.id, DASHBOARD_AUDIT.UPDATED, DASHBOARD_AUDIT_TARGET.DASHBOARD, id, {
    fields: Object.keys(parsed),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return NextResponse.json({ error: 'super only' }, { status: 403 });
  const { id } = await ctx.params;

  const existing = await loadDashboardById(id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.dashboard.is_builtin) {
    return NextResponse.json({ error: 'cannot delete a builtin dashboard' }, { status: 409 });
  }

  await sql`DELETE FROM admin_dashboards WHERE id = ${id}`;
  // FK CASCADE handles admin_dashboard_blocks and admin_dashboard_role_grants.

  await logAdminAction(admin.id, DASHBOARD_AUDIT.DELETED, DASHBOARD_AUDIT_TARGET.DASHBOARD, id, {
    slug: existing.dashboard.slug,
  });

  return NextResponse.json({ ok: true });
}
