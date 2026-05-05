// /admin/dashboards/manage — builder/admin surface listing every dashboard.
//
// Editors land here (super or admin.dashboards.edit). View-level admins also
// reach this page if they navigate explicitly, but write affordances hide.
// The user-facing viewer (where granted admins consume dashboards) is at
// /admin/dashboards.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { ensureBuiltinsReconciled } from '@/lib/admin/dashboards/builtins';

export default async function DashboardsManagePage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');
  if (!admin.is_super && !hasPermission(admin, 'admin.dashboards.view')) {
    redirect('/admin');
  }
  const canEdit = admin.is_super || hasPermission(admin, 'admin.dashboards.edit');

  await ensureBuiltinsReconciled();

  const rows = await sql`
    SELECT
      d.id, d.slug, d.label, d.description, d.scope, d.is_builtin,
      d.created_at, d.updated_at,
      (SELECT COUNT(*) FROM admin_dashboard_blocks b WHERE b.dashboard_id = d.id)::int AS section_count,
      (SELECT COUNT(*) FROM admin_dashboard_role_grants g WHERE g.dashboard_id = d.id)::int AS grant_count
    FROM admin_dashboards d
    ORDER BY d.is_builtin DESC, d.label ASC
  `;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--admin-text)' }}>Manage dashboards</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--admin-text-muted)' }}>
            Configurable role-scoped views assembled from the field registry. {rows.length} total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/dashboards"
            className="text-xs px-3 py-1.5 rounded"
            style={{ color: 'var(--admin-text-muted)', border: '1px solid var(--admin-border)' }}
          >
            ← Viewer
          </Link>
          {canEdit && (
            <Link
              href="/admin/dashboards/new"
              className="text-xs px-3 py-1.5 rounded font-medium"
              style={{
                background: '#60a5fa',
                color: 'white',
              }}
            >
              + New dashboard
            </Link>
          )}
        </div>
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--admin-border)', background: 'var(--admin-bg-elevated)' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--admin-bg)' }}>
              <Th>Label</Th>
              <Th>Slug</Th>
              <Th>Scope</Th>
              <Th align="right">Sections</Th>
              <Th align="right">Grants</Th>
              <Th>Type</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d: Record<string, unknown>) => (
              <tr
                key={d.id as string}
                className="border-t"
                style={{ borderColor: 'var(--admin-border)' }}
              >
                <Td>
                  <div className="font-medium" style={{ color: 'var(--admin-text)' }}>{d.label as string}</div>
                  {Boolean(d.description) && (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
                      {d.description as string}
                    </div>
                  )}
                </Td>
                <Td>
                  <code className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
                    {d.slug as string}
                  </code>
                </Td>
                <Td>
                  <span className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
                    {d.scope as string}
                  </span>
                </Td>
                <Td align="right">{d.section_count as number}</Td>
                <Td align="right">{d.grant_count as number}</Td>
                <Td>
                  {d.is_builtin ? (
                    <span
                      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        background: 'rgba(96, 165, 250, 0.12)',
                        color: '#60a5fa',
                        border: '1px solid var(--admin-border)',
                      }}
                    >
                      builtin
                    </span>
                  ) : (
                    <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>custom</span>
                  )}
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-3">
                    {d.scope === 'user_grid' && (
                      <Link
                        href={`/admin/dashboards/${d.id}/view`}
                        className="text-xs"
                        style={{ color: 'var(--admin-text-muted)' }}
                      >
                        view
                      </Link>
                    )}
                    {canEdit ? (
                      <Link
                        href={`/admin/dashboards/${d.id}/edit`}
                        className="text-xs"
                        style={{ color: '#60a5fa' }}
                      >
                        edit
                      </Link>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>view only</span>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--admin-text-muted)' }}>
            No dashboards yet. Click <strong>New dashboard</strong> to create one.
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className="text-[10px] uppercase tracking-wider font-semibold px-3 py-2"
      style={{ color: 'var(--admin-text-muted)', textAlign: align ?? 'left' }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className="px-3 py-2 align-top text-xs" style={{ textAlign: align ?? 'left' }}>
      {children}
    </td>
  );
}
