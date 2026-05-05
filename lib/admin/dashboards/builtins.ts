// Code-defined builtin dashboards. Seeded into admin_dashboards on demand
// (idempotent). Builtins are flagged is_builtin=true and cannot be deleted
// via the builder UI; the in-code definition here is canonical, so every
// reconcile run resyncs the label/description/blocks to match.
//
// Phase 1 ships with `default-user-profile`. The other four user_detail
// builtins from spec §14 (support-user-overview, safety-user-review,
// driver-coverage-review, rider-history) come in follow-up sessions as the
// remaining blocks (verification, disputes, hmu_history, rides, ratings,
// admin_notes) are implemented.

import { sql } from '@/lib/db/client';
import type { DashboardScope } from '@/lib/db/types';

interface BuiltinBlock {
  block_key: string;
  config?: Record<string, unknown>;
  col_span?: number;
}

interface BuiltinDashboard {
  slug: string;
  label: string;
  description: string;
  scope: DashboardScope;
  blocks: BuiltinBlock[];
  /**
   * Permissions whose holders should be granted access at seed time. Any role
   * with a matching `<slug>.view`, `.edit`, or `.publish` permission gets a
   * grant row. Empty array = builtin has no auto-grants (super-only until the
   * roles matrix is used to grant manually).
   *
   * NOTE: this is a one-shot at seed time — new roles with the permission do
   * NOT automatically receive a grant later. Use the roles matrix to manage
   * grants going forward.
   */
  default_grant_permissions: string[];
}

export const BUILTIN_DASHBOARDS: BuiltinDashboard[] = [
  {
    slug: 'default-user-profile',
    label: 'User profile',
    description: 'Default fallback view shown on /admin/users/[id] when no other dashboard is selected.',
    scope: 'user_detail',
    blocks: [
      { block_key: 'user.basics', col_span: 12 },
      { block_key: 'user.driver_areas', col_span: 6 },
      { block_key: 'user.rider_areas', col_span: 6 },
    ],
    // Always-visible — bypasses the grant table via ALWAYS_VISIBLE_BUILTIN_SLUGS
    // in runtime.ts. Listed empty here because no per-role grants are needed.
    default_grant_permissions: [],
  },
  {
    slug: 'support-user-overview',
    label: 'Support: user overview',
    description: 'Front-line support view: account state, payment readiness, recent activity, prior notes.',
    scope: 'user_detail',
    blocks: [
      { block_key: 'user.basics', col_span: 12 },
      { block_key: 'user.verification', col_span: 12 },
      { block_key: 'user.rides', col_span: 12 },
      { block_key: 'user.admin_notes', col_span: 12 },
    ],
    default_grant_permissions: ['act.support', 'act.users'],
  },
  {
    slug: 'safety-user-review',
    label: 'Safety: user review',
    description: 'Trust and safety lens: rating signal, dispute pattern, link history, ride history.',
    scope: 'user_detail',
    blocks: [
      { block_key: 'user.basics', col_span: 12 },
      { block_key: 'user.ratings', col_span: 6 },
      { block_key: 'user.disputes', col_span: 6 },
      { block_key: 'user.hmu_history', col_span: 12 },
      { block_key: 'user.rides', col_span: 12 },
    ],
    // No `act.safety` slug exists today (/admin/safety is super-only). Use
    // act.disputes as a proxy until safety has its own slug.
    default_grant_permissions: ['act.disputes'],
  },
  {
    slug: 'driver-coverage-review',
    label: 'Driver coverage review',
    description: 'Where this driver runs, reliability signal, account state.',
    scope: 'user_detail',
    blocks: [
      { block_key: 'user.basics', col_span: 12 },
      { block_key: 'user.driver_areas', col_span: 12 },
      { block_key: 'user.rides', col_span: 12 },
      { block_key: 'user.ratings', col_span: 6 },
      { block_key: 'user.verification', col_span: 6 },
    ],
    default_grant_permissions: ['monitor.liveops', 'grow.outreach'],
  },
  {
    slug: 'rider-history',
    label: 'Rider history',
    description: 'Rider-side support: where they need rides, who they\'ve linked with, recent rides, notes.',
    scope: 'user_detail',
    blocks: [
      { block_key: 'user.basics', col_span: 12 },
      { block_key: 'user.rider_areas', col_span: 12 },
      { block_key: 'user.hmu_history', col_span: 12 },
      { block_key: 'user.rides', col_span: 12 },
      { block_key: 'user.admin_notes', col_span: 12 },
    ],
    default_grant_permissions: ['act.support', 'act.users'],
  },
];

/**
 * Idempotent reconcile. Inserts missing builtins, updates labels/descriptions/
 * blocks of existing builtins to match code, and never deletes user-created
 * dashboards. Safe to call from any request handler — exits fast if up to date.
 *
 * Block reconciliation does a full delete + insert under one transaction
 * (delete all blocks for the dashboard, re-insert from BUILTIN_DASHBOARDS).
 * Simpler than per-row diffing and the row count is tiny.
 */
export async function reconcileBuiltinDashboards(): Promise<void> {
  for (const def of BUILTIN_DASHBOARDS) {
    // Upsert the dashboard row by slug.
    const [dash] = await sql`
      INSERT INTO admin_dashboards (slug, label, description, scope, is_builtin)
      VALUES (${def.slug}, ${def.label}, ${def.description}, ${def.scope}, TRUE)
      ON CONFLICT (slug) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        scope = EXCLUDED.scope,
        is_builtin = TRUE,
        updated_at = NOW()
      RETURNING id
    `;
    const dashboardId = dash.id as string;

    // Replace block list.
    await sql`DELETE FROM admin_dashboard_blocks WHERE dashboard_id = ${dashboardId}`;
    for (let i = 0; i < def.blocks.length; i++) {
      const b = def.blocks[i];
      await sql`
        INSERT INTO admin_dashboard_blocks (dashboard_id, block_key, config, sort_order, col_span)
        VALUES (
          ${dashboardId},
          ${b.block_key},
          ${JSON.stringify(b.config ?? {})}::jsonb,
          ${i},
          ${b.col_span ?? 12}
        )
      `;
    }

    // Default grants — one-shot at seed time. Grant any role whose
    // permissions[] contains <slug>.view / .edit / .publish for any of the
    // permissions listed. ON CONFLICT DO NOTHING means re-running the
    // reconciler doesn't grant the same dashboard twice or override manual
    // revocations.
    if (def.default_grant_permissions.length > 0) {
      const expanded = def.default_grant_permissions.flatMap((slug) => [
        `${slug}.view`, `${slug}.edit`, `${slug}.publish`,
      ]);
      await sql`
        INSERT INTO admin_dashboard_role_grants (dashboard_id, role_id)
        SELECT ${dashboardId}, ar.id
        FROM admin_roles ar
        WHERE ar.is_super = FALSE
          AND ar.permissions && ${expanded}::text[]
        ON CONFLICT (dashboard_id, role_id) DO NOTHING
      `;
    }
  }
}

// Cheap once-per-process guard so we don't reconcile on every request. The
// in-code definition is the source of truth; if you redeploy with a changed
// builtin, the next cold start runs reconcile again.
let reconciledThisProcess = false;
export async function ensureBuiltinsReconciled(): Promise<void> {
  if (reconciledThisProcess) return;
  await reconcileBuiltinDashboards();
  reconciledThisProcess = true;
}
