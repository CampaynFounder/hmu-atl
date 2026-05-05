// Server-side dashboard runtime: load definitions, enforce grants, resolve
// per-block market scope, and fan out block fetches in parallel.
//
// Used by /admin/users/[id] (user_detail), the future /admin/dashboards/[slug]
// (market_overview), and the data API that re-fetches a single dashboard
// without rerendering the whole page.

import { sql } from '@/lib/db/client';
import type { AdminUser } from '@/lib/admin/helpers';
import type {
  AdminDashboard,
  AdminDashboardBlock,
  DashboardScope,
} from '@/lib/db/types';
import { getBlock } from './blocks/registry';
import type { AnyBlockDefinition, BlockFetchContext, MarketScopeStrategy } from './blocks/types';

// ─── Market scope resolver ─────────────────────────────────────────────────

interface ResolveCtx {
  admin: AdminUser;
  /** Active market the admin has selected, if known. Optional — only matters for 'admin_active'. */
  adminActiveMarketId?: string | null;
  /** market_id of the user being viewed, if dashboard scope === 'user_detail'. */
  viewedUserMarketId?: string | null;
}

export function resolveMarketIds(
  block: AnyBlockDefinition,
  ctx: ResolveCtx,
): string[] | null {
  if (!block.marketAware) return null;

  const strategy: MarketScopeStrategy = block.marketScope ?? 'admin_active';

  switch (strategy) {
    case 'viewed_user': {
      // Only meaningful for user_detail dashboards. Falls back to admin's
      // allowlist if the viewed user has no market_id (rare — orphan rows).
      if (ctx.viewedUserMarketId) return [ctx.viewedUserMarketId];
      return ctx.admin.is_super ? null : ctx.admin.admin_market_ids ?? null;
    }

    case 'admin_active': {
      if (ctx.adminActiveMarketId) return [ctx.adminActiveMarketId];
      // No active market chosen → fall through to allowlist so we never leak
      // beyond what the admin can see.
      return ctx.admin.is_super ? null : ctx.admin.admin_market_ids ?? null;
    }

    case 'admin_all_allowed': {
      // Cross-market activity. Super sees everything; restricted admins see
      // their full allowlist.
      if (ctx.admin.is_super) return null;
      return ctx.admin.admin_market_ids ?? null;
    }
  }
}

// ─── Dashboard loaders ─────────────────────────────────────────────────────

interface DashboardWithBlocks {
  dashboard: AdminDashboard;
  blocks: AdminDashboardBlock[];
}

function rowToDashboard(r: Record<string, unknown>): AdminDashboard {
  return {
    id: r.id as string,
    slug: r.slug as string,
    label: r.label as string,
    description: (r.description as string | null) ?? null,
    scope: r.scope as DashboardScope,
    market_id: (r.market_id as string | null) ?? null,
    is_builtin: r.is_builtin as boolean,
    created_by: (r.created_by as string | null) ?? null,
    created_at: r.created_at as Date,
    updated_at: r.updated_at as Date,
  };
}

function rowToBlock(r: Record<string, unknown>): AdminDashboardBlock {
  return {
    id: r.id as string,
    dashboard_id: r.dashboard_id as string,
    block_key: r.block_key as string,
    config: (r.config as Record<string, unknown>) ?? {},
    sort_order: r.sort_order as number,
    col_span: r.col_span as number,
    created_at: r.created_at as Date,
  };
}

export async function loadDashboardBySlug(slug: string): Promise<DashboardWithBlocks | null> {
  const [dashRow] = await sql`
    SELECT id, slug, label, description, scope, market_id, is_builtin, created_by, created_at, updated_at
    FROM admin_dashboards WHERE slug = ${slug} LIMIT 1
  `;
  if (!dashRow) return null;
  const dashboard = rowToDashboard(dashRow);
  const blockRows = await sql`
    SELECT id, dashboard_id, block_key, config, sort_order, col_span, created_at
    FROM admin_dashboard_blocks
    WHERE dashboard_id = ${dashboard.id}
    ORDER BY sort_order ASC
  `;
  return { dashboard, blocks: blockRows.map(rowToBlock) };
}

export async function loadDashboardById(id: string): Promise<DashboardWithBlocks | null> {
  const [dashRow] = await sql`
    SELECT id, slug, label, description, scope, market_id, is_builtin, created_by, created_at, updated_at
    FROM admin_dashboards WHERE id = ${id} LIMIT 1
  `;
  if (!dashRow) return null;
  const dashboard = rowToDashboard(dashRow);
  const blockRows = await sql`
    SELECT id, dashboard_id, block_key, config, sort_order, col_span, created_at
    FROM admin_dashboard_blocks
    WHERE dashboard_id = ${dashboard.id}
    ORDER BY sort_order ASC
  `;
  return { dashboard, blocks: blockRows.map(rowToBlock) };
}

// ─── Access ────────────────────────────────────────────────────────────────

// Builtins that are visible to anyone who can reach the route (no grant
// needed). These are pure empty-state fallbacks; specific role-scoped
// builtins still go through the grant table.
const ALWAYS_VISIBLE_BUILTIN_SLUGS = new Set(['default-user-profile']);

/**
 * True if the admin can view the dashboard. Super always passes; the
 * always-visible builtins (e.g. default-user-profile) bypass grants;
 * otherwise we defer to admin_dashboard_role_grants. Admin without a role
 * can never see a non-builtin dashboard.
 */
export async function canViewDashboard(
  admin: AdminUser,
  dashboard: { id: string; slug: string; is_builtin: boolean },
): Promise<boolean> {
  if (admin.is_super) return true;
  if (dashboard.is_builtin && ALWAYS_VISIBLE_BUILTIN_SLUGS.has(dashboard.slug)) return true;
  // Admin must have a role to be granted anything.
  const adminRoleId = await getAdminRoleIdForUser(admin.id);
  if (!adminRoleId) return false;
  const [row] = await sql`
    SELECT 1 AS ok FROM admin_dashboard_role_grants
    WHERE dashboard_id = ${dashboard.id} AND role_id = ${adminRoleId}
    LIMIT 1
  `;
  return Boolean(row);
}

async function getAdminRoleIdForUser(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT admin_role_id FROM users WHERE id = ${userId} LIMIT 1`;
  return (row?.admin_role_id as string | null) ?? null;
}

/**
 * Dashboards this admin can see for a given scope, ordered by builtin-first
 * then label. Used by /admin/users/[id] to render the tab strip.
 */
export async function listAccessibleDashboards(
  admin: AdminUser,
  scope: DashboardScope,
): Promise<AdminDashboard[]> {
  if (admin.is_super) {
    const rows = await sql`
      SELECT id, slug, label, description, scope, market_id, is_builtin, created_by, created_at, updated_at
      FROM admin_dashboards
      WHERE scope = ${scope}
      ORDER BY is_builtin DESC, label ASC
    `;
    return rows.map(rowToDashboard);
  }

  const adminRoleId = await getAdminRoleIdForUser(admin.id);
  // Anyone reaching this can still see the always-visible builtins, regardless
  // of role/grants. UNION + DISTINCT keeps it one round-trip.
  const alwaysVisible = Array.from(ALWAYS_VISIBLE_BUILTIN_SLUGS);
  const rows = await sql`
    SELECT DISTINCT d.id, d.slug, d.label, d.description, d.scope, d.market_id, d.is_builtin,
           d.created_by, d.created_at, d.updated_at
    FROM admin_dashboards d
    LEFT JOIN admin_dashboard_role_grants g
      ON g.dashboard_id = d.id AND g.role_id = ${adminRoleId}
    WHERE d.scope = ${scope}
      AND (
        g.role_id IS NOT NULL
        OR (d.is_builtin = TRUE AND d.slug = ANY(${alwaysVisible}::text[]))
      )
    ORDER BY d.is_builtin DESC, d.label ASC
  `;
  return rows.map(rowToDashboard);
}

// ─── Block fetching ────────────────────────────────────────────────────────

export interface BlockResult {
  blockId: string;
  blockKey: string;
  colSpan: number;
  data: unknown;
  error: string | null;
}

interface FetchOptions {
  admin: AdminUser;
  /** Required for user_detail dashboards. Used to scope the userId param + viewed_user marketScope. */
  viewedUserId?: string;
  viewedUserMarketId?: string | null;
  /** Optional: market the admin has selected (for admin_active scope). */
  adminActiveMarketId?: string | null;
}

export async function fetchDashboardData(
  blocks: AdminDashboardBlock[],
  opts: FetchOptions,
): Promise<BlockResult[]> {
  const baseCtx: Omit<BlockFetchContext, 'marketIds'> = {
    userId: opts.viewedUserId,
    adminUserId: opts.admin.id,
  };

  const tasks = blocks.map(async (b): Promise<BlockResult> => {
    const def = getBlock(b.block_key);
    if (!def) {
      return {
        blockId: b.id,
        blockKey: b.block_key,
        colSpan: b.col_span,
        data: null,
        error: `Unknown block: ${b.block_key}`,
      };
    }
    if (def.deprecated) {
      return {
        blockId: b.id,
        blockKey: b.block_key,
        colSpan: b.col_span,
        data: null,
        error: 'Block is deprecated',
      };
    }

    try {
      const marketIds = resolveMarketIds(def, {
        admin: opts.admin,
        adminActiveMarketId: opts.adminActiveMarketId,
        viewedUserMarketId: opts.viewedUserMarketId,
      });
      const ctx: BlockFetchContext = { ...baseCtx, marketIds };
      const config = def.configSchema.parse(b.config);
      const data = await def.fetch(ctx, config);
      return {
        blockId: b.id,
        blockKey: b.block_key,
        colSpan: b.col_span,
        data,
        error: null,
      };
    } catch (e) {
      return {
        blockId: b.id,
        blockKey: b.block_key,
        colSpan: b.col_span,
        data: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  return Promise.all(tasks);
}
