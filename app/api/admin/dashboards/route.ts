// /api/admin/dashboards
//   GET  → list dashboards visible to the caller (super sees all, others see
//          their grants + always-visible builtins). Filtered by ?scope= if set.
//   POST → create a new dashboard (super only). Body validated by zod.
//
// Sections are { label, field_keys, col_span } — engineers register fields in
// lib/admin/dashboards/fields/registry.ts; superadmin assembles them into
// sections via the builder UI without writing code.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, unauthorizedResponse, logAdminAction, hasPermission } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { listAccessibleDashboards } from '@/lib/admin/dashboards/runtime';
import { ensureBuiltinsReconciled } from '@/lib/admin/dashboards/builtins';
import { getField } from '@/lib/admin/dashboards/fields/registry';
import { DASHBOARD_AUDIT, DASHBOARD_AUDIT_TARGET } from '@/lib/admin/dashboards/audit-events';
import type { DashboardScope } from '@/lib/db/types';

const sectionSchema = z.object({
  label: z.string().max(80).nullable().optional(),
  field_keys: z.array(z.string().min(1)).min(1).max(40),
  col_span: z.number().int().min(1).max(12).optional(),
});

const createBody = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/, 'kebab-case, 3-64 chars'),
  label: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  scope: z.enum(['user_detail', 'market_overview']),
  market_id: z.string().uuid().nullable().optional(),
  sections: z.array(sectionSchema).min(1).max(20),
  role_ids: z.array(z.string().uuid()).default([]),
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  await ensureBuiltinsReconciled();

  const scopeParam = req.nextUrl.searchParams.get('scope') as DashboardScope | null;
  const scopes: DashboardScope[] = scopeParam ? [scopeParam] : ['user_detail', 'market_overview'];

  const all = (await Promise.all(scopes.map((s) => listAccessibleDashboards(admin, s)))).flat();
  return NextResponse.json({ dashboards: all });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super && !hasPermission(admin, 'admin.dashboards.edit')) {
    return NextResponse.json({ error: 'admin.dashboards.edit required' }, { status: 403 });
  }

  let parsed: z.infer<typeof createBody>;
  try {
    const json = await req.json();
    parsed = createBody.parse(json);
  } catch (e) {
    return NextResponse.json({ error: 'invalid body', details: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  // Validate every field key exists in the registry. Field-grain dashboards
  // currently target user_detail; extend here when we ship market-overview
  // field families.
  const allFieldKeys = parsed.sections.flatMap((s) => s.field_keys);
  for (const key of allFieldKeys) {
    if (!getField(key)) {
      return NextResponse.json({ error: `unknown field key: ${key}` }, { status: 400 });
    }
  }

  const existing = await sql`SELECT 1 FROM admin_dashboards WHERE slug = ${parsed.slug} LIMIT 1`;
  if (existing.length) return NextResponse.json({ error: 'slug already exists' }, { status: 409 });

  const [dash] = await sql`
    INSERT INTO admin_dashboards (slug, label, description, scope, market_id, is_builtin, created_by)
    VALUES (
      ${parsed.slug},
      ${parsed.label},
      ${parsed.description ?? null},
      ${parsed.scope},
      ${parsed.market_id ?? null},
      FALSE,
      ${admin.id}
    )
    RETURNING id
  `;
  const dashboardId = dash.id as string;

  for (let i = 0; i < parsed.sections.length; i++) {
    const s = parsed.sections[i];
    await sql`
      INSERT INTO admin_dashboard_blocks (dashboard_id, section_type, label, field_keys, sort_order, col_span)
      VALUES (${dashboardId}, 'fields', ${s.label ?? null}, ${s.field_keys}::text[], ${i}, ${s.col_span ?? 12})
    `;
  }

  for (const role_id of parsed.role_ids) {
    await sql`
      INSERT INTO admin_dashboard_role_grants (dashboard_id, role_id, granted_by)
      VALUES (${dashboardId}, ${role_id}, ${admin.id})
      ON CONFLICT (dashboard_id, role_id) DO NOTHING
    `;
  }

  await logAdminAction(admin.id, DASHBOARD_AUDIT.CREATED, DASHBOARD_AUDIT_TARGET.DASHBOARD, dashboardId, {
    slug: parsed.slug,
    section_count: parsed.sections.length,
    field_count: allFieldKeys.length,
    role_count: parsed.role_ids.length,
  });

  return NextResponse.json({ id: dashboardId, slug: parsed.slug }, { status: 201 });
}
