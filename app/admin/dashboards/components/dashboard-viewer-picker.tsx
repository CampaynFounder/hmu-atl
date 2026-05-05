'use client';

// Viewer landing for granted admins. Shows the dashboards they're allowed
// to see, plus a user search to bind one of those dashboards to a target.
// Picking (dashboard, user) navigates to /admin/users/[id]?dashboard=<slug>.
//
// Editors get a "Manage" link to the builder via the parent server component.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserSearchPicker } from '@/app/admin/components/user-search-picker';
import type { AdminUserSearchResult } from '@/lib/db/types';

interface DashboardCard {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  scope: 'user_detail' | 'market_overview' | 'user_grid';
  is_builtin: boolean;
}

export function DashboardViewerPicker({ dashboards }: { dashboards: DashboardCard[] }) {
  const router = useRouter();
  const [pickedDashboard, setPickedDashboard] = useState<DashboardCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onUserSelect = (user: AdminUserSearchResult) => {
    if (!pickedDashboard) {
      setError('Pick a dashboard first.');
      return;
    }
    router.push(`/admin/users/${user.id}?dashboard=${encodeURIComponent(pickedDashboard.slug)}`);
  };

  if (dashboards.length === 0) {
    return (
      <div
        className="rounded-lg p-6 text-sm text-center"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text-muted)' }}
      >
        You don&apos;t have access to any dashboards yet. Ask a super admin to grant your role one or more dashboards.
      </div>
    );
  }

  // user_grid dashboards stand alone — no user binding required.
  // user_detail dashboards still need a user picker (legacy).
  const needsPicker = pickedDashboard?.scope === 'user_detail';

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--admin-text-muted)' }}>
          Pick a dashboard
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {dashboards.map((d) => {
            const active = pickedDashboard?.id === d.id;
            // user_grid dashboards open straight away — clicking is a navigation,
            // not just a "pick" for the next step.
            if (d.scope === 'user_grid') {
              return (
                <Link
                  key={d.id}
                  href={`/admin/dashboards/${d.id}/view`}
                  className="text-left rounded-lg p-3 transition-colors block"
                  style={{
                    background: 'var(--admin-bg-elevated)',
                    border: '1px solid var(--admin-border)',
                    color: 'var(--admin-text)',
                  }}
                >
                  <CardHeader d={d} />
                  <div className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: '#60a5fa' }}>
                    Open grid →
                  </div>
                </Link>
              );
            }
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => { setPickedDashboard(d); setError(null); }}
                className="text-left rounded-lg p-3 transition-colors"
                style={{
                  background: active ? 'rgba(96, 165, 250, 0.08)' : 'var(--admin-bg-elevated)',
                  border: `1px solid ${active ? '#60a5fa' : 'var(--admin-border)'}`,
                  color: 'var(--admin-text)',
                }}
              >
                <CardHeader d={d} />
              </button>
            );
          })}
        </div>
      </div>

      {needsPicker && (
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--admin-text-muted)' }}>
            Pick a user (this dashboard is per-user)
          </div>
          <div
            className="rounded-lg p-3"
            style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
          >
            <UserSearchPicker
              onSelect={onUserSelect}
              placeholder={`Search users to view "${pickedDashboard!.label}"…`}
            />
          </div>
          {error && (
            <p className="text-[11px] mt-2" style={{ color: '#f87171' }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CardHeader({ d }: { d: DashboardCard }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{d.label}</span>
        {d.is_builtin && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa' }}
          >
            builtin
          </span>
        )}
        <span
          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: 'var(--admin-bg)', color: 'var(--admin-text-muted)' }}
        >
          {d.scope.replace('_', ' ')}
        </span>
      </div>
      <code className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>{d.slug}</code>
      {d.description && (
        <div className="text-[11px] mt-1.5" style={{ color: 'var(--admin-text-muted)' }}>
          {d.description}
        </div>
      )}
    </>
  );
}
