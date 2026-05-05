// /admin/users/[id]
//
// Real route hosting user_detail dashboards. Replaces the inline modal that
// today lives in app/admin/users/user-management.tsx — first piece of the
// retire-modal arc from the dashboards spec (§7.2).
//
// Server-rendered. Tabs across the top are one-per-accessible-dashboard;
// switching tabs is a fresh navigation (?dashboard=slug). Each section
// resolves its fields in parallel, with column-source fields bundled per
// table to keep round-trips down (see runtime.ts).

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import {
  loadDashboardBySlug,
  listAccessibleDashboards,
  canViewDashboard,
  fetchDashboardSections,
  type FieldResult,
  type SectionResult,
} from '@/lib/admin/dashboards/runtime';
import { ensureBuiltinsReconciled } from '@/lib/admin/dashboards/builtins';
import { getField } from '@/lib/admin/dashboards/fields/registry';

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

  await ensureBuiltinsReconciled();

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
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--admin-text-muted)' }}>
          That account is an admin user. Admin profiles aren&apos;t surfaced here.
        </p>
      </div>
    );
  }

  const accessible = await listAccessibleDashboards(admin, 'user_detail');

  const slug = requestedSlug ?? DEFAULT_DASHBOARD_SLUG;
  const dashboardBundle = await loadDashboardBySlug(slug);
  if (!dashboardBundle) {
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

  const sectionResults = await fetchDashboardSections(dashboardBundle.sections, {
    admin,
    viewedUserId: userId,
    viewedUserMarketId: (viewed.market_id as string | null) ?? null,
  });

  const headerName = (viewed.display_name as string | null) || (viewed.handle as string | null) || 'Unnamed';

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
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

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {sectionResults.map((section) => (
          <SectionCard key={section.section.id} result={section} />
        ))}
        {sectionResults.length === 0 && (
          <div className="sm:col-span-12">
            <p className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
              This dashboard has no sections configured.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionCard({ result }: { result: SectionResult }) {
  const span = result.section.col_span ?? 12;
  return (
    <div
      className="sm:col-span-12 rounded-lg p-3"
      style={{
        gridColumn: `span ${span} / span ${span}`,
        background: 'var(--admin-bg-elevated)',
        border: '1px solid var(--admin-border)',
      }}
    >
      {result.section.label && (
        <div
          className="text-[10px] uppercase tracking-wider mb-2 pb-2"
          style={{ color: 'var(--admin-text-muted)', borderBottom: '1px solid var(--admin-border)' }}
        >
          {result.section.label}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {result.fields.map((f) => (
          <FieldSlot key={f.fieldKey} field={f} userProfileType={result.userProfileType} />
        ))}
        {result.fields.length === 0 && (
          <div className="col-span-full text-xs" style={{ color: 'var(--admin-text-muted)' }}>
            No fields in this section.
          </div>
        )}
      </div>
    </div>
  );
}

function FieldSlot({ field, userProfileType }: { field: FieldResult; userProfileType: string }) {
  if (field.error) {
    return (
      <div
        className="col-span-full rounded p-2 text-xs"
        style={{
          background: 'rgba(248, 113, 113, 0.08)',
          color: '#f87171',
          border: '1px solid var(--admin-border)',
        }}
      >
        <div className="font-medium mb-0.5">Field error: {field.fieldKey}</div>
        <div style={{ color: 'var(--admin-text-muted)' }}>{field.error}</div>
      </div>
    );
  }
  const def = getField(field.fieldKey);
  if (!def) return null;

  // Skip rendering if the field doesn't apply to this user's profile_type.
  // 'any' applies to everyone; otherwise the user's type must be in applies_to.
  const applies =
    def.applies_to.includes('any') ||
    def.applies_to.includes(userProfileType as 'rider' | 'driver' | 'admin');
  if (!applies) return null;

  const Component = def.Render as React.ComponentType<{ value: unknown; userProfileType: string }>;
  const wrapperClass = def.render === 'list' ? 'col-span-full' : '';
  return (
    <div className={wrapperClass}>
      <Component value={field.value} userProfileType={userProfileType} />
    </div>
  );
}
