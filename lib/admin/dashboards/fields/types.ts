// Field registry types. A "field" is the atomic unit of dashboard
// configuration — one piece of data with a label, a typed source, and a
// renderer. Superadmin assembles dashboards by picking fields into sections.
//
// Engineers register fields here; sensitive columns (Stripe tokens, raw
// payment_intent_id, etc.) are deliberately excluded so the builder UI
// can never expose them. Adding a field is a small typed PR.

import type { ComponentType } from 'react';

export type AppliesTo = 'rider' | 'driver' | 'admin' | 'any';

/**
 * How a market-aware field resolves which markets to filter by:
 *  - 'viewed_user'        → use the viewed user's home market
 *  - 'admin_active'       → use the admin's active market context
 *  - 'admin_all_allowed'  → union of admin's permitted markets
 */
export type MarketScopeStrategy = 'viewed_user' | 'admin_active' | 'admin_all_allowed';

/**
 * How a field renders inside a section. Drives layout decisions:
 *  - 'stat'    → labeled value tile (lots of these per row in a grid)
 *  - 'badge'   → coloured pill (status, tier)
 *  - 'flag'    → icon + label, grouped (good-for-you / heads-up flags)
 *  - 'list'    → full-width embedded list (recent rides, recent disputes)
 */
export type FieldRenderKind = 'stat' | 'badge' | 'flag' | 'list';

export interface FieldFetchContext {
  /** Resolved per field.marketScope. NULL = no market filter. */
  marketIds: string[] | null;
  /** Required for user_detail dashboards. */
  userId?: string;
  adminUserId: string;
}

/**
 * Source describes how the field's value is obtained. The runtime knows how
 * to bundle fields with the same column-source into one SELECT to avoid N+1.
 *
 *  - user_column      → SELECT col FROM users WHERE id = userId
 *  - driver_column    → SELECT col FROM driver_profiles WHERE user_id = userId
 *  - rider_column     → SELECT col FROM rider_profiles  WHERE user_id = userId
 *  - aggregate        → custom subquery returning one scalar value
 *  - collection       → custom query returning rows for a 'list' render
 */
export type FieldSource =
  | { kind: 'user_column'; column: string; cast?: string }
  | { kind: 'driver_column'; column: string; cast?: string }
  | { kind: 'rider_column'; column: string; cast?: string }
  | { kind: 'aggregate'; fetch: (ctx: FieldFetchContext) => Promise<unknown> }
  | { kind: 'collection'; fetch: (ctx: FieldFetchContext) => Promise<unknown> };

export interface FieldDefinition<TValue = unknown> {
  /** Stable key, e.g. 'users.display_name'. Stored in admin_dashboard_blocks.field_keys[]. */
  key: string;
  /** Builder UI display, e.g. 'Display name'. */
  label: string;
  /** Builder UI grouping, e.g. 'Identity', 'Areas', 'Activity'. */
  category: string;
  /** Searchable description / tooltip. */
  description?: string;
  /** Profile types this field applies to. ['any'] = universal. */
  applies_to: AppliesTo[];
  /** Drives section layout. */
  render: FieldRenderKind;
  /** How the value is fetched. */
  source: FieldSource;
  /** Market filtering — only meaningful for aggregates/collections. */
  marketAware?: boolean;
  marketScope?: MarketScopeStrategy;
  /** Render the resolved value. Receives whatever fetch / column produced. */
  Render: ComponentType<{ value: TValue; userProfileType: string }>;
  /** If true, hidden from builder picker (saved dashboards still render). */
  deprecated?: boolean;
}

export type AnyFieldDefinition = FieldDefinition<unknown>;

// Builder-UI metadata shape returned by /api/admin/dashboards/fields. No JSX,
// no SQL — safe to ship to the client.
export interface FieldMetadata {
  key: string;
  label: string;
  category: string;
  description?: string;
  applies_to: AppliesTo[];
  render: FieldRenderKind;
  marketAware: boolean;
  deprecated: boolean;
}

export function fieldMetadata(f: AnyFieldDefinition): FieldMetadata {
  return {
    key: f.key,
    label: f.label,
    category: f.category,
    description: f.description,
    applies_to: f.applies_to,
    render: f.render,
    marketAware: f.marketAware ?? false,
    deprecated: f.deprecated ?? false,
  };
}

// Section is the persisted grouping. Stored in admin_dashboard_blocks rows.
export interface SectionDefinition {
  id: string;
  label: string | null;
  field_keys: string[];
  col_span: number;
  sort_order: number;
}

export type SectionRenderKind = 'fields'; // future: 'custom' for hardcoded blocks
