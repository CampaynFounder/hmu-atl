// Block registry types for admin dashboards.
//
// A "block" is a self-contained piece of a dashboard: it owns its own SQL
// query, its config schema, and its server-rendered React component. The
// registry is a typed map of block_key → BlockDefinition, keeping the
// surface auditable (no user-supplied SQL anywhere).
//
// See docs/ADMIN-DASHBOARDS-SPEC.md §5 for the design rationale.

import type { ComponentType } from 'react';
import type { ZodSchema } from 'zod';

export type BlockScope = 'user' | 'market' | 'global';

// How a marketAware block resolves which markets to filter by. Per the spec,
// area-shaped data lives in one market while activity-shaped data is real
// signal across markets — so each block declares its own strategy rather
// than there being a single global rule.
export type MarketScopeStrategy =
  | 'viewed_user'         // use users.market_id of the user being viewed
  | 'admin_active'        // use the market the admin has selected via useMarket() — DEFAULT
  | 'admin_all_allowed';  // no market filter; show everything within admin.admin_market_ids

// Resolved context passed to a block's fetch() function. Resolved once per
// dashboard render by lib/admin/dashboards/runtime.ts.
export interface BlockFetchContext {
  // Resolved per block.marketScope. NULL = no market filter (cross-market).
  // Single-element array = filter to one market. Multi-element = filter to a
  // list (used by admin_all_allowed when the admin has explicit market scope).
  marketIds: string[] | null;

  // Present iff the parent dashboard scope === 'user_detail'. For market_overview
  // dashboards this is undefined.
  userId?: string;

  // The acting admin — used for grant lookups and logging. Always set.
  adminUserId: string;
}

export interface BlockDefinition<TConfig = unknown, TData = unknown> {
  /** Stable identifier, e.g. 'user.driver_areas'. Stored in admin_dashboard_blocks.block_key. */
  key: string;

  /** Builder UI display name. */
  label: string;

  /** Builder UI tooltip. */
  description: string;

  /** Must match the parent dashboard's scope. */
  scope: BlockScope;

  /**
   * If true, the runtime resolves marketIds before calling fetch(). If false,
   * marketIds is always null and the block returns global data.
   */
  marketAware: boolean;

  /**
   * Ignored unless marketAware && scope === 'user'. Determines how the runtime
   * resolves marketIds for this block. Defaults to 'admin_active'.
   */
  marketScope?: MarketScopeStrategy;

  /** Validates a row in admin_dashboard_blocks.config. */
  configSchema: ZodSchema<TConfig>;

  /** Default config used when builder UI adds a fresh block to a dashboard. */
  defaultConfig: TConfig;

  /**
   * Server-side data fetcher. Runs in parallel with all other blocks of the
   * dashboard (Promise.all). Throws → block renders an error placeholder; the
   * rest of the dashboard still renders.
   */
  fetch: (ctx: BlockFetchContext, config: TConfig) => Promise<TData>;

  /**
   * Server component (or client component imported into one) that renders the
   * block. Receives the data returned by fetch() and the config.
   */
  Component: ComponentType<{ data: TData; config: TConfig }>;

  /**
   * If true, hidden from the builder picker. Existing dashboards using this
   * block still render (with empty state if needed). Lets us deprecate blocks
   * without breaking saved dashboards.
   */
  deprecated?: boolean;
}

// Helper for registry: existential type that erases TConfig/TData. Use this
// when iterating over the registry where the specific generic params don't
// matter.
export type AnyBlockDefinition = BlockDefinition<unknown, unknown>;
