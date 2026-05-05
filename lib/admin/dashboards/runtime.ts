// Server-side dashboard runtime. Fetches dashboard config, enforces grants,
// resolves per-field marketScope, and bundles column-sourced fields by source
// table to keep round-trip count down.

import { sql } from '@/lib/db/client';
import type { AdminUser } from '@/lib/admin/helpers';
import type { AdminDashboard, DashboardScope } from '@/lib/db/types';
import { getField } from './fields/registry';
import type {
  AnyFieldDefinition,
  FieldFetchContext,
  MarketScopeStrategy,
} from './fields/types';

// ─── Section + Field types ─────────────────────────────────────────────────

export interface DashboardSection {
  id: string;
  dashboard_id: string;
  section_type: string; // 'fields' for v1
  label: string | null;
  field_keys: string[];
  col_span: number;
  sort_order: number;
}

interface DashboardWithSections {
  dashboard: AdminDashboard;
  sections: DashboardSection[];
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

function rowToSection(r: Record<string, unknown>): DashboardSection {
  return {
    id: r.id as string,
    dashboard_id: r.dashboard_id as string,
    section_type: (r.section_type as string) ?? 'fields',
    label: (r.label as string | null) ?? null,
    field_keys: (r.field_keys as string[] | null) ?? [],
    col_span: r.col_span as number,
    sort_order: r.sort_order as number,
  };
}

// ─── Loaders ───────────────────────────────────────────────────────────────

export async function loadDashboardBySlug(slug: string): Promise<DashboardWithSections | null> {
  const [dashRow] = await sql`
    SELECT id, slug, label, description, scope, market_id, is_builtin, created_by, created_at, updated_at
    FROM admin_dashboards WHERE slug = ${slug} LIMIT 1`;
  if (!dashRow) return null;
  const dashboard = rowToDashboard(dashRow);
  const sectionRows = await sql`
    SELECT id, dashboard_id, section_type, label, field_keys, col_span, sort_order
    FROM admin_dashboard_blocks
    WHERE dashboard_id = ${dashboard.id}
    ORDER BY sort_order ASC`;
  return { dashboard, sections: sectionRows.map(rowToSection) };
}

export async function loadDashboardById(id: string): Promise<DashboardWithSections | null> {
  const [dashRow] = await sql`
    SELECT id, slug, label, description, scope, market_id, is_builtin, created_by, created_at, updated_at
    FROM admin_dashboards WHERE id = ${id} LIMIT 1`;
  if (!dashRow) return null;
  const dashboard = rowToDashboard(dashRow);
  const sectionRows = await sql`
    SELECT id, dashboard_id, section_type, label, field_keys, col_span, sort_order
    FROM admin_dashboard_blocks
    WHERE dashboard_id = ${dashboard.id}
    ORDER BY sort_order ASC`;
  return { dashboard, sections: sectionRows.map(rowToSection) };
}

// ─── Access ────────────────────────────────────────────────────────────────
// Strict grant-only visibility for non-super admins. Every dashboard a role
// can see must have a row in admin_dashboard_role_grants. No implicit "always
// visible" builtins, no permission-derived auto-grants — the roles UI is the
// single source of truth.

export async function canViewDashboard(
  admin: AdminUser,
  dashboard: { id: string; slug: string; is_builtin: boolean },
): Promise<boolean> {
  if (admin.is_super) return true;
  // admin.admin_role_id is set by requireAdmin (and overridden by preview-swap),
  // so this naturally honors "Preview as <role>".
  if (!admin.admin_role_id) return false;
  const [row] = await sql`
    SELECT 1 AS ok FROM admin_dashboard_role_grants
    WHERE dashboard_id = ${dashboard.id} AND role_id = ${admin.admin_role_id}
    LIMIT 1`;
  return Boolean(row);
}

export async function listAccessibleDashboards(
  admin: AdminUser,
  scope: DashboardScope,
): Promise<AdminDashboard[]> {
  if (admin.is_super) {
    const rows = await sql`
      SELECT id, slug, label, description, scope, market_id, is_builtin, created_by, created_at, updated_at
      FROM admin_dashboards
      WHERE scope = ${scope}
      ORDER BY is_builtin DESC, label ASC`;
    return rows.map(rowToDashboard);
  }
  if (!admin.admin_role_id) return [];
  const rows = await sql`
    SELECT d.id, d.slug, d.label, d.description, d.scope, d.market_id, d.is_builtin,
           d.created_by, d.created_at, d.updated_at
    FROM admin_dashboards d
    INNER JOIN admin_dashboard_role_grants g
      ON g.dashboard_id = d.id AND g.role_id = ${admin.admin_role_id}
    WHERE d.scope = ${scope}
    ORDER BY d.is_builtin DESC, d.label ASC`;
  return rows.map(rowToDashboard);
}

// ─── Market scope resolver ─────────────────────────────────────────────────

interface ResolveCtx {
  admin: AdminUser;
  adminActiveMarketId?: string | null;
  viewedUserMarketId?: string | null;
}

export function resolveMarketIds(field: AnyFieldDefinition, ctx: ResolveCtx): string[] | null {
  if (!field.marketAware) return null;
  const strategy: MarketScopeStrategy = field.marketScope ?? 'admin_active';
  switch (strategy) {
    case 'viewed_user':
      if (ctx.viewedUserMarketId) return [ctx.viewedUserMarketId];
      return ctx.admin.is_super ? null : ctx.admin.admin_market_ids ?? null;
    case 'admin_active':
      if (ctx.adminActiveMarketId) return [ctx.adminActiveMarketId];
      return ctx.admin.is_super ? null : ctx.admin.admin_market_ids ?? null;
    case 'admin_all_allowed':
      if (ctx.admin.is_super) return null;
      return ctx.admin.admin_market_ids ?? null;
  }
}

// ─── Field fetching with column bundling ───────────────────────────────────

export interface FieldResult {
  fieldKey: string;
  value: unknown;
  error: string | null;
  /** profile_type of the viewed user — passed to renderers so they can render conditionally. */
  userProfileType: string;
}

export interface SectionResult {
  section: DashboardSection;
  fields: FieldResult[];
  /** profile_type of the viewed user. */
  userProfileType: string;
}

interface FetchOptions {
  admin: AdminUser;
  viewedUserId?: string;
  viewedUserMarketId?: string | null;
  adminActiveMarketId?: string | null;
}

/**
 * Resolve every field across all sections, bundling user_column / driver_column
 * / rider_column fields into single SELECTs per source table. Aggregate /
 * collection fields run their own fetchers in parallel.
 */
export async function fetchDashboardSections(
  sections: DashboardSection[],
  opts: FetchOptions,
): Promise<SectionResult[]> {
  // Read viewed user's profile_type once for conditional rendering downstream.
  let userProfileType = '';
  if (opts.viewedUserId) {
    const [r] = await sql`SELECT profile_type FROM users WHERE id = ${opts.viewedUserId} LIMIT 1`;
    userProfileType = (r?.profile_type as string) ?? '';
  }

  // Collect every distinct field across all sections.
  const allKeys = Array.from(new Set(sections.flatMap((s) => s.field_keys)));
  const definitions = allKeys.map((k) => ({ key: k, def: getField(k) }));

  // Bundle column fields by source table. Aggregate / collection are handled
  // individually since each has its own fetch.
  const userColumns: { key: string; column: string; cast?: string }[] = [];
  const driverColumns: { key: string; column: string; cast?: string }[] = [];
  const riderColumns: { key: string; column: string; cast?: string }[] = [];
  const customFields: { key: string; def: AnyFieldDefinition }[] = [];

  for (const { key, def } of definitions) {
    if (!def) continue;
    if (def.deprecated) continue;
    if (def.source.kind === 'user_column') {
      userColumns.push({ key, column: def.source.column, cast: def.source.cast });
    } else if (def.source.kind === 'driver_column') {
      driverColumns.push({ key, column: def.source.column, cast: def.source.cast });
    } else if (def.source.kind === 'rider_column') {
      riderColumns.push({ key, column: def.source.column, cast: def.source.cast });
    } else {
      customFields.push({ key, def });
    }
  }

  // Bundled column fetches in parallel with custom fetches.
  const valuesByKey = new Map<string, unknown>();
  const errorsByKey = new Map<string, string>();

  const tasks: Promise<void>[] = [];

  if (opts.viewedUserId) {
    if (userColumns.length > 0) {
      tasks.push((async () => {
        try {
          const cols = userColumns.map((c) => `${c.column}${c.cast ? `::${c.cast}` : ''} AS "${c.key}"`).join(', ');
          // Direct-call form (sql(query, params)) is required because the
          // column list is dynamic. Column names come from the typed registry,
          // never user input — safe from injection.
          const rows = (await sql(
            `SELECT ${cols} FROM users WHERE id = $1 LIMIT 1`,
            [opts.viewedUserId!],
          )) as Record<string, unknown>[];
          const row = rows[0];
          if (row) {
            for (const c of userColumns) valuesByKey.set(c.key, row[c.key]);
          }
        } catch (e) {
          for (const c of userColumns) {
            errorsByKey.set(c.key, e instanceof Error ? e.message : String(e));
          }
        }
      })());
    }
    if (driverColumns.length > 0) {
      tasks.push((async () => {
        try {
          const cols = driverColumns.map((c) => `${c.column}${c.cast ? `::${c.cast}` : ''} AS "${c.key}"`).join(', ');
          const rows = (await sql(
            `SELECT ${cols} FROM driver_profiles WHERE user_id = $1 LIMIT 1`,
            [opts.viewedUserId!],
          )) as Record<string, unknown>[];
          const row = rows[0];
          for (const c of driverColumns) valuesByKey.set(c.key, row?.[c.key] ?? null);
        } catch (e) {
          for (const c of driverColumns) {
            errorsByKey.set(c.key, e instanceof Error ? e.message : String(e));
          }
        }
      })());
    }
    if (riderColumns.length > 0) {
      tasks.push((async () => {
        try {
          const cols = riderColumns.map((c) => `${c.column}${c.cast ? `::${c.cast}` : ''} AS "${c.key}"`).join(', ');
          const rows = (await sql(
            `SELECT ${cols} FROM rider_profiles WHERE user_id = $1 LIMIT 1`,
            [opts.viewedUserId!],
          )) as Record<string, unknown>[];
          const row = rows[0];
          for (const c of riderColumns) valuesByKey.set(c.key, row?.[c.key] ?? null);
        } catch (e) {
          for (const c of riderColumns) {
            errorsByKey.set(c.key, e instanceof Error ? e.message : String(e));
          }
        }
      })());
    }
  }

  for (const { key, def } of customFields) {
    tasks.push((async () => {
      try {
        const marketIds = resolveMarketIds(def, {
          admin: opts.admin,
          adminActiveMarketId: opts.adminActiveMarketId,
          viewedUserMarketId: opts.viewedUserMarketId,
        });
        const ctx: FieldFetchContext = {
          marketIds,
          userId: opts.viewedUserId,
          adminUserId: opts.admin.id,
        };
        if (def.source.kind !== 'aggregate' && def.source.kind !== 'collection') {
          throw new Error(`Unexpected source kind for ${key}: ${def.source.kind}`);
        }
        const value = await def.source.fetch(ctx);
        valuesByKey.set(key, value);
      } catch (e) {
        errorsByKey.set(key, e instanceof Error ? e.message : String(e));
      }
    })());
  }

  await Promise.all(tasks);

  // Assemble per-section results in field-key order so renderers can iterate.
  return sections.map((section) => ({
    section,
    userProfileType,
    fields: section.field_keys.map((key) => {
      const def = getField(key);
      if (!def) {
        return { fieldKey: key, value: null, error: `Unknown field: ${key}`, userProfileType };
      }
      if (errorsByKey.has(key)) {
        return { fieldKey: key, value: null, error: errorsByKey.get(key) ?? 'unknown error', userProfileType };
      }
      return { fieldKey: key, value: valuesByKey.get(key), error: null, userProfileType };
    }),
  }));
}

// ─── User grid fetching ────────────────────────────────────────────────────

export interface UserGridFilters {
  /** 'driver' | 'rider' | null (any) */
  profileType?: string | null;
  status?: string | null;
  marketId?: string | null;
  /** ILIKE %q% across name/handle/phone */
  search?: string | null;
  limit?: number;
  offset?: number;
}

export interface UserGridRow {
  id: string;
  profile_type: string;
  /** Map<fieldKey, value | null>. Keys present even when value is null/error. */
  values: Record<string, unknown>;
  /** fieldKey → error message; only present for fields that failed to resolve. */
  errors: Record<string, string>;
}

export interface UserGridResult {
  rows: UserGridRow[];
  total: number;
}

interface UserGridFetchOptions {
  admin: AdminUser;
  fieldKeys: string[];
  filters: UserGridFilters;
  adminActiveMarketId?: string | null;
}

/**
 * Resolve filters → page of user_ids → batched column / aggregate fetches per
 * field. Designed for grid views: O(distinct source tables + distinct
 * aggregate fields) queries, not O(rows × fields).
 *
 * Collection fields are silently skipped — they don't fit a grid cell. The
 * caller is expected to filter via `isGridable()` before calling.
 */
export async function fetchUserGridRows(opts: UserGridFetchOptions): Promise<UserGridResult> {
  const limit = Math.min(Math.max(opts.filters.limit ?? 50, 1), 200);
  const offset = Math.max(opts.filters.offset ?? 0, 0);
  const profileType = opts.filters.profileType ?? null;
  const status = opts.filters.status ?? null;
  const marketId = opts.filters.marketId ?? null;
  const searchPattern = opts.filters.search?.trim() ? `%${opts.filters.search.trim()}%` : null;

  // Page-of-users + total. One coalescing CTE keeps both in a single round-trip.
  // Filters are all nullable bind params; the WHERE clause no-ops when null.
  const userRows = await sql`
    WITH base AS (
      SELECT u.id, u.profile_type
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
      WHERE u.is_admin = FALSE
        AND (${profileType}::text IS NULL OR u.profile_type = ${profileType})
        AND (${status}::text       IS NULL OR u.account_status = ${status})
        AND (${marketId}::uuid     IS NULL OR u.market_id = ${marketId})
        AND (${searchPattern}::text IS NULL OR
             dp.display_name ILIKE ${searchPattern} OR
             dp.first_name   ILIKE ${searchPattern} OR
             rp.display_name ILIKE ${searchPattern} OR
             rp.first_name   ILIKE ${searchPattern} OR
             dp.handle       ILIKE ${searchPattern} OR
             rp.handle       ILIKE ${searchPattern} OR
             dp.phone        ILIKE ${searchPattern} OR
             u.clerk_id      ILIKE ${searchPattern})
    )
    SELECT id, profile_type, (SELECT COUNT(*) FROM base)::int AS total
    FROM base ORDER BY id LIMIT ${limit} OFFSET ${offset}
  `;
  const userIds: string[] = userRows.map((r: Record<string, unknown>) => r.id as string);
  const total = userRows.length > 0 ? Number(userRows[0].total) : 0;

  if (userIds.length === 0) return { rows: [], total };

  // Initialize result rows.
  const rowsById = new Map<string, UserGridRow>();
  for (const r of userRows) {
    const id = r.id as string;
    rowsById.set(id, {
      id,
      profile_type: r.profile_type as string,
      values: Object.create(null),
      errors: Object.create(null),
    });
  }

  // Bucket field defs by fetch strategy.
  const userColumns: { key: string; column: string; cast?: string }[] = [];
  const driverColumns: { key: string; column: string; cast?: string }[] = [];
  const riderColumns: { key: string; column: string; cast?: string }[] = [];
  const aggregates: { key: string; def: AnyFieldDefinition }[] = [];

  for (const key of opts.fieldKeys) {
    const def = getField(key);
    if (!def || def.deprecated) continue;
    if (def.source.kind === 'collection') continue; // not gridable
    if (def.source.kind === 'user_column') {
      userColumns.push({ key, column: def.source.column, cast: def.source.cast });
    } else if (def.source.kind === 'driver_column') {
      driverColumns.push({ key, column: def.source.column, cast: def.source.cast });
    } else if (def.source.kind === 'rider_column') {
      riderColumns.push({ key, column: def.source.column, cast: def.source.cast });
    } else if (def.source.kind === 'aggregate') {
      aggregates.push({ key, def });
    }
  }

  const tasks: Promise<void>[] = [];

  if (userColumns.length > 0) {
    tasks.push((async () => {
      try {
        const cols = userColumns.map((c) => `${c.column}${c.cast ? `::${c.cast}` : ''} AS "${c.key}"`).join(', ');
        const rows = (await sql(
          `SELECT id, ${cols} FROM users WHERE id = ANY($1::uuid[])`,
          [userIds],
        )) as Record<string, unknown>[];
        for (const r of rows) {
          const row = rowsById.get(r.id as string);
          if (!row) continue;
          for (const c of userColumns) row.values[c.key] = r[c.key] ?? null;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const r of rowsById.values()) for (const c of userColumns) r.errors[c.key] = msg;
      }
    })());
  }
  if (driverColumns.length > 0) {
    tasks.push((async () => {
      try {
        const cols = driverColumns.map((c) => `${c.column}${c.cast ? `::${c.cast}` : ''} AS "${c.key}"`).join(', ');
        const rows = (await sql(
          `SELECT user_id, ${cols} FROM driver_profiles WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        )) as Record<string, unknown>[];
        for (const r of rows) {
          const row = rowsById.get(r.user_id as string);
          if (!row) continue;
          for (const c of driverColumns) row.values[c.key] = r[c.key] ?? null;
        }
        // Users without a driver_profile get nulls (Map default).
        for (const row of rowsById.values()) {
          for (const c of driverColumns) if (!(c.key in row.values)) row.values[c.key] = null;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const r of rowsById.values()) for (const c of driverColumns) r.errors[c.key] = msg;
      }
    })());
  }
  if (riderColumns.length > 0) {
    tasks.push((async () => {
      try {
        const cols = riderColumns.map((c) => `${c.column}${c.cast ? `::${c.cast}` : ''} AS "${c.key}"`).join(', ');
        const rows = (await sql(
          `SELECT user_id, ${cols} FROM rider_profiles WHERE user_id = ANY($1::uuid[])`,
          [userIds],
        )) as Record<string, unknown>[];
        for (const r of rows) {
          const row = rowsById.get(r.user_id as string);
          if (!row) continue;
          for (const c of riderColumns) row.values[c.key] = r[c.key] ?? null;
        }
        for (const row of rowsById.values()) {
          for (const c of riderColumns) if (!(c.key in row.values)) row.values[c.key] = null;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        for (const r of rowsById.values()) for (const c of riderColumns) r.errors[c.key] = msg;
      }
    })());
  }

  // Aggregates: prefer batchFetch when defined (single SQL across all userIds).
  // Fall back to per-user fetch (N+1) for aggregates without a batch impl —
  // acceptable for tiny pages; opt out via gridable: false on slow ones.
  for (const { key, def } of aggregates) {
    if (def.source.kind !== 'aggregate') continue;
    const marketIds = resolveMarketIds(def, {
      admin: opts.admin,
      adminActiveMarketId: opts.adminActiveMarketId,
      viewedUserMarketId: null,
    });
    const batch = def.source.batchFetch;
    if (batch) {
      tasks.push((async () => {
        try {
          const m = await batch({ userIds, marketIds, adminUserId: opts.admin.id });
          for (const row of rowsById.values()) row.values[key] = m.get(row.id) ?? null;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          for (const row of rowsById.values()) row.errors[key] = msg;
        }
      })());
    } else {
      // Per-user fallback. Capped naturally by `limit`.
      tasks.push((async () => {
        await Promise.all(userIds.map(async (uid) => {
          try {
            const v = await (def.source as { fetch: (c: FieldFetchContext) => Promise<unknown> })
              .fetch({ marketIds, userId: uid, adminUserId: opts.admin.id });
            const row = rowsById.get(uid);
            if (row) row.values[key] = v;
          } catch (e) {
            const row = rowsById.get(uid);
            if (row) row.errors[key] = e instanceof Error ? e.message : String(e);
          }
        }));
      })());
    }
  }

  await Promise.all(tasks);

  // Stable order = same as userRows (id-sorted).
  return {
    rows: userIds.map((id) => rowsById.get(id)!).filter(Boolean),
    total,
  };
}
