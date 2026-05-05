'use client';

// Viewer landing for granted admins. Lists every dashboard the admin can
// see (granted via admin_dashboard_role_grants, plus always-visible
// builtins) as a clickable card. user_grid dashboards open the grid view;
// user_detail dashboards (legacy) link to the user-bound view via the user
// search route.

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
  // Only set when an admin clicks a user_detail dashboard — that flow still
  // needs a user binding. Otherwise the viewer-picker is just a list.
  const [pickedDetailDashboard, setPickedDetailDashboard] = useState<DashboardCard | null>(null);

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

  const onUserSelect = (user: AdminUserSearchResult) => {
    if (!pickedDetailDashboard) return;
    router.push(`/admin/users/${user.id}?dashboard=${encodeURIComponent(pickedDetailDashboard.slug)}`);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {dashboards.map((d) =>
          d.scope === 'user_grid' ? (
            <Link
              key={d.id}
              href={`/admin/dashboards/${d.id}/view`}
              className="text-left rounded-lg p-3 block transition-colors hover:border-[#60a5fa]"
              style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
            >
              <CardHeader d={d} />
              <div className="text-[10px] mt-1.5" style={{ color: '#60a5fa' }}>Open grid →</div>
            </Link>
          ) : (
            <button
              key={d.id}
              type="button"
              onClick={() => setPickedDetailDashboard(d)}
              className="text-left rounded-lg p-3 transition-colors"
              style={{
                background: pickedDetailDashboard?.id === d.id ? 'rgba(96, 165, 250, 0.08)' : 'var(--admin-bg-elevated)',
                border: `1px solid ${pickedDetailDashboard?.id === d.id ? '#60a5fa' : 'var(--admin-border)'}`,
                color: 'var(--admin-text)',
              }}
            >
              <CardHeader d={d} />
              <div className="text-[10px] mt-1.5" style={{ color: 'var(--admin-text-muted)' }}>Per-user view — pick a user below</div>
            </button>
          ),
        )}
      </div>

      {pickedDetailDashboard && (
        <div
          className="rounded-lg p-3"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
        >
          <UserSearchPicker
            onSelect={onUserSelect}
            placeholder={`Search users to view "${pickedDetailDashboard.label}"…`}
          />
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
