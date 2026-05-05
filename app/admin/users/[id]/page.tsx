// /admin/users/[id]
//
// Real route hosting user_detail dashboards. Replaces the inline modal that
// today lives in app/admin/users/user-management.tsx — first piece of the
// retire-modal arc from the dashboards spec (§7.2).
//
// Server-rendered. Tabs across the top are one-per-accessible-dashboard;
// switching tabs is a fresh navigation (?dashboard=slug). All blocks for the
// chosen dashboard run their fetchers in parallel.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import {
  loadDashboardBySlug,
  listAccessibleDashboards,
  canViewDashboard,
  fetchDashboardData,
  type BlockResult,
} from '@/lib/admin/dashboards/runtime';
import { ensureBuiltinsReconciled } from '@/lib/admin/dashboards/builtins';
import { getBlock } from '@/lib/admin/dashboards/blocks/registry';

const DEFAULT_DASHBOARD_SLUG = 'default-user-profile';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dashboard?: string }>;
}

export default async function UserDetailPage({ params, searchParams }: PageProps) {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');

  const { id: userId } = await params;
  const { dashboard: requestedSlug } = await searchParams;

  // Builtins materialize on first request — cheap once-per-process gate.
  await ensureBuiltinsReconciled();

  // Lookup the viewed user. Admins are excluded from this surface; if you
  // need an admin-on-admin view, build it as a separate dashboard scope.
  const [viewed] = await sql`
    SELECT u.id, u.profile_type, u.market_id, u.is_admin,
           COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS display_name,
           COALESCE(dp.handle, rp.handle) AS handle
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  if (!viewed) notFound();
  if (viewed.is_admin) {
    // Admins are not the audience for this surface; render a hint rather than
    // dumping nothing.
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--admin-text-muted)' }}>
          That account is an admin user. Admin profiles aren&apos;t surfaced here.
        </p>
      </div>
    );
  }

  // Tabs: every user_detail dashboard the admin can view, builtin first.
  const accessible = await listAccessibleDashboards(admin, 'user_detail');

  // Pick the dashboard to render.
  const slug = requestedSlug ?? DEFAULT_DASHBOARD_SLUG;
  const dashboardBundle = await loadDashboardBySlug(slug);
  if (!dashboardBundle) {
    // Requested slug doesn't exist — fall back to the default if it's not what
    // we already tried. If even the default is missing, the reconciler ran
    // and produced nothing, which means the migration didn't apply.
    if (slug !== DEFAULT_DASHBOARD_SLUG) {
      redirect(`/admin/users/${userId}`);
    }
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: '#f87171' }}>
          Default user-profile dashboard not found. Run the dashboards migration and reload.
        </p>
      </div>
    );
  }

  const grant = await canViewDashboard(admin, dashboardBundle.dashboard);
  if (!grant) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--admin-text-muted)' }}>
          You don&apos;t have access to this dashboard.
        </p>
      </div>
    );
  }

  // Run all blocks in parallel.
  const blockResults = await fetchDashboardData(dashboardBundle.blocks, {
    admin,
    viewedUserId: userId,
    viewedUserMarketId: (viewed.market_id as string | null) ?? null,
  });

  const headerName = (viewed.display_name as string | null) || (viewed.handle as string | null) || 'Unnamed';

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--admin-text)' }}>
            {headerName}
          </h1>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
            {viewed.profile_type as string}
          </div>
        </div>
        <Link
          href="/admin/users"
          className="text-xs"
          style={{ color: 'var(--admin-text-muted)' }}
        >
          ← back to users
        </Link>
      </div>

      {/* Tab strip */}
      {accessible.length > 1 && (
        <div
          className="flex gap-1 mb-4 overflow-x-auto -mx-1 px-1 pb-1"
          role="tablist"
          aria-label="Dashboard views"
        >
          {accessible.map((d) => {
            const active = d.slug === dashboardBundle.dashboard.slug;
            return (
              <Link
                key={d.id}
                href={`/admin/users/${userId}?dashboard=${encodeURIComponent(d.slug)}`}
                role="tab"
                aria-selected={active}
                className="text-xs px-3 py-1.5 rounded shrink-0 whitespace-nowrap transition-colors"
                style={{
                  background: active ? 'var(--admin-bg-elevated)' : 'transparent',
                  color: active ? 'var(--admin-text)' : 'var(--admin-text-muted)',
                  border: '1px solid var(--admin-border)',
                }}
              >
                {d.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Block grid. col_span is on a 12-col base so users can tile half-width
          cards next to full-width ones. On narrow viewports everything
          collapses to single column. */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {blockResults.map((result) => (
          <div
            key={result.blockId}
            className="sm:col-span-12"
            style={{
              gridColumn: `span ${result.colSpan} / span ${result.colSpan}`,
            }}
          >
            <BlockSlot result={result} />
          </div>
        ))}
        {blockResults.length === 0 && (
          <div className="sm:col-span-12">
            <p className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
              This dashboard has no blocks configured.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockSlot({ result }: { result: BlockResult }) {
  if (result.error) {
    return (
      <div
        className="rounded-lg p-4 text-xs"
        style={{
          background: 'rgba(248, 113, 113, 0.08)',
          color: '#f87171',
          border: '1px solid var(--admin-border)',
        }}
      >
        <div className="font-medium mb-1">Block error: {result.blockKey}</div>
        <div style={{ color: 'var(--admin-text-muted)' }}>{result.error}</div>
      </div>
    );
  }
  const def = getBlock(result.blockKey);
  if (!def) {
    // Should not happen — fetchDashboardData would have set error. Defensive.
    return null;
  }
  const Component = def.Component as React.ComponentType<{ data: unknown; config: unknown }>;
  return <Component data={result.data} config={{}} />;
}
