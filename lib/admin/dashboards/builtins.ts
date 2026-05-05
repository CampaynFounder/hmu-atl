// Code-defined builtin dashboards. Seeded into admin_dashboards on demand
// (idempotent). Builtins are flagged is_builtin=true and cannot be deleted
// via the builder UI; the in-code definition here is canonical, so every
// reconcile run resyncs the label/description/sections to match.
//
// Each dashboard is composed of sections; each section lists field keys from
// lib/admin/dashboards/fields/registry.ts. Fields whose `applies_to` doesn't
// match the viewed user's profile_type render as nothing — that lets one
// builtin serve drivers and riders without per-type forks.

import { sql } from '@/lib/db/client';
import type { DashboardScope } from '@/lib/db/types';

interface BuiltinSection {
  label: string | null;
  field_keys: string[];
  col_span?: number;
}

interface BuiltinDashboard {
  slug: string;
  label: string;
  description: string;
  scope: DashboardScope;
  sections: BuiltinSection[];
}

const IDENTITY_BASICS = [
  'users.display_name',
  'users.handle',
  'users.profile_type',
  'users.account_status',
  'users.tier',
  'users.og_status',
  'users.market',
  'users.created_at',
  'users.phone',
];

const VERIFICATION_BASICS = [
  'users.is_verified',
  'users.phone_present',
  'driver.video_recorded',
  'driver.stripe_onboarded',
  'driver.payout_setup',
  'rider.payment_method_count',
];

const ACTIVITY_BASICS = [
  'users.completed_rides',
  'users.chill_score',
  'aggregate.last_ride_at',
  'aggregate.dispute_count',
  'aggregate.dispute_open_count',
];

const RATINGS_BASICS = [
  'aggregate.ratings_total',
  'aggregate.rating_chill',
  'aggregate.rating_cool_af',
  'aggregate.rating_kinda_creepy',
  'aggregate.rating_weirdo',
];

export const BUILTIN_DASHBOARDS: BuiltinDashboard[] = [
  {
    slug: 'all-users',
    label: 'All users',
    description: 'Default user grid — every user with key identity, verification, and activity columns. Edit to customize.',
    scope: 'user_grid',
    sections: [
      {
        label: null,
        field_keys: [
          'users.avatar',
          'users.display_name',
          'users.handle',
          'users.profile_type',
          'users.account_status',
          'users.tier',
          'users.og_status',
          'users.market',
          'users.phone',
          'users.is_verified',
          'driver.stripe_onboarded',
          'driver.payout_setup',
          'driver.video_recorded',
          'rider.payment_method_count',
          'users.completed_rides',
          'users.chill_score',
          'users.created_at',
        ],
        col_span: 12,
      },
    ],
  },
  {
    slug: 'default-user-profile',
    label: 'User profile',
    description: 'Default fallback view shown on /admin/users/[id] when no other dashboard is selected.',
    scope: 'user_detail',
    sections: [
      { label: 'Identity', field_keys: IDENTITY_BASICS, col_span: 12 },
      { label: 'Driver coverage', field_keys: ['driver.area_slugs', 'driver.services_entire_market', 'driver.accepts_long_distance'], col_span: 6 },
      { label: 'Rider areas', field_keys: ['rider.home_area', 'rider.recent_post_areas'], col_span: 6 },
    ],
  },
  {
    slug: 'support-user-overview',
    label: 'Support: user overview',
    description: 'Front-line support view: account state, payment readiness, recent activity, prior notes.',
    scope: 'user_detail',
    sections: [
      { label: 'Identity', field_keys: IDENTITY_BASICS, col_span: 12 },
      { label: 'Verification', field_keys: VERIFICATION_BASICS, col_span: 12 },
      { label: 'Activity', field_keys: ACTIVITY_BASICS, col_span: 12 },
      { label: 'Recent rides', field_keys: ['collection.recent_rides'], col_span: 12 },
      { label: 'Notes', field_keys: ['collection.admin_notes'], col_span: 12 },
    ],
  },
  {
    slug: 'safety-user-review',
    label: 'Safety: user review',
    description: 'Trust and safety lens: rating signal, dispute pattern, link history, ride history.',
    scope: 'user_detail',
    sections: [
      { label: 'Identity', field_keys: IDENTITY_BASICS, col_span: 12 },
      { label: 'Ratings', field_keys: RATINGS_BASICS, col_span: 6 },
      {
        label: 'HMU history',
        field_keys: [
          'aggregate.hmus_sent_total',
          'aggregate.hmus_sent_linked',
          'aggregate.hmus_sent_dismissed',
          'aggregate.hmus_received_total',
          'aggregate.hmus_received_linked',
        ],
        col_span: 6,
      },
      { label: 'Disputes', field_keys: ['collection.recent_disputes'], col_span: 12 },
      { label: 'Recent rides', field_keys: ['collection.recent_rides'], col_span: 12 },
    ],
  },
  {
    slug: 'driver-coverage-review',
    label: 'Driver coverage review',
    description: 'Where this driver runs, reliability signal, account state.',
    scope: 'user_detail',
    sections: [
      { label: 'Identity', field_keys: IDENTITY_BASICS, col_span: 12 },
      {
        label: 'Coverage',
        field_keys: ['driver.area_slugs', 'driver.services_entire_market', 'driver.accepts_long_distance'],
        col_span: 12,
      },
      { label: 'Activity', field_keys: ACTIVITY_BASICS, col_span: 12 },
      { label: 'Ratings', field_keys: RATINGS_BASICS, col_span: 6 },
      { label: 'Verification', field_keys: VERIFICATION_BASICS, col_span: 6 },
    ],
  },
  {
    slug: 'rider-history',
    label: 'Rider history',
    description: 'Rider-side support: where they need rides, who they\'ve linked with, recent rides, notes.',
    scope: 'user_detail',
    sections: [
      { label: 'Identity', field_keys: IDENTITY_BASICS, col_span: 12 },
      { label: 'Areas', field_keys: ['rider.home_area', 'rider.recent_post_areas'], col_span: 12 },
      {
        label: 'HMU history',
        field_keys: ['aggregate.hmus_received_total', 'aggregate.hmus_received_linked'],
        col_span: 12,
      },
      { label: 'Recent rides', field_keys: ['collection.recent_rides'], col_span: 12 },
      { label: 'Notes', field_keys: ['collection.admin_notes'], col_span: 12 },
    ],
  },
];

/**
 * Idempotent reconcile. Inserts missing builtins, updates labels/descriptions/
 * sections of existing builtins to match code, and never deletes user-created
 * dashboards. Safe to call from any request handler — exits fast if up to date.
 *
 * Section reconciliation does a full delete + insert (delete all sections for
 * the dashboard, re-insert from BUILTIN_DASHBOARDS). Simpler than per-row
 * diffing and the row count is tiny.
 *
 * Does NOT touch admin_dashboard_role_grants — the roles UI is the single
 * source of truth for who can view what. Grant changes made there persist
 * across reconciles and deploys.
 */
export async function reconcileBuiltinDashboards(): Promise<void> {
  for (const def of BUILTIN_DASHBOARDS) {
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

    await sql`DELETE FROM admin_dashboard_blocks WHERE dashboard_id = ${dashboardId}`;
    for (let i = 0; i < def.sections.length; i++) {
      const s = def.sections[i];
      await sql`
        INSERT INTO admin_dashboard_blocks (dashboard_id, section_type, label, field_keys, sort_order, col_span)
        VALUES (
          ${dashboardId},
          'fields',
          ${s.label},
          ${s.field_keys}::text[],
          ${i},
          ${s.col_span ?? 12}
        )
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
