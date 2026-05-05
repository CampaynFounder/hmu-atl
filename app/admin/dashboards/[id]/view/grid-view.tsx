'use client';

// Client side of /admin/dashboards/[id]/view. Owns filter chrome + the
// fetch/render loop. Cell rendering uses each FieldDefinition's `Cell` if
// declared, falling back to a generic value-as-text cell.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMarket } from '@/app/admin/components/market-context';
import { getField } from '@/lib/admin/dashboards/fields/registry';
import type { FieldMetadata } from '@/lib/admin/dashboards/fields/types';

interface GridRow {
  id: string;
  profile_type: string;
  values: Record<string, unknown>;
  errors: Record<string, string>;
}

interface GridResponse {
  fieldKeys: string[];
  rows: GridRow[];
  total: number;
}

const PAGE_SIZE = 50;
const PROFILE_TYPES = [
  { value: '', label: 'Any role' },
  { value: 'driver', label: 'Drivers' },
  { value: 'rider', label: 'Riders' },
];
const STATUSES = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'pending_activation', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
];

export function GridView({ dashboardId, columns }: { dashboardId: string; columns: FieldMetadata[] }) {
  const { selectedMarketId } = useMarket();

  const [profileType, setProfileType] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState(0);

  const [data, setData] = useState<GridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [profileType, status, debouncedSearch, selectedMarketId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (profileType) params.set('profileType', profileType);
    if (status) params.set('status', status);
    if (selectedMarketId) params.set('marketId', selectedMarketId);
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));

    fetch(`/api/admin/dashboards/${dashboardId}/grid?${params.toString()}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return r.json() as Promise<GridResponse>;
      })
      .then((d) => setData(d))
      .catch((e) => { if (e.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [dashboardId, profileType, status, selectedMarketId, debouncedSearch, page]);

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const start = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const end = Math.min(total, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const visibleColumns = useMemo(() => columns.filter((c) => c.gridable && !c.deprecated), [columns]);

  return (
    <div>
      {/* Filter chrome */}
      <div
        className="rounded-lg p-3 mb-3"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, handle, phone…"
            className="text-sm px-2 py-1.5 rounded outline-none"
            style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          />
          <select
            value={profileType}
            onChange={(e) => setProfileType(e.target.value)}
            className="text-sm px-2 py-1.5 rounded outline-none"
            style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          >
            {PROFILE_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-sm px-2 py-1.5 rounded outline-none"
            style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          >
            {STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
          </select>
          <div className="text-[11px] flex items-center justify-end pr-2" style={{ color: 'var(--admin-text-muted)' }}>
            {loading ? 'Loading…' : `${start}–${end} of ${total}`}
          </div>
        </div>
        {visibleColumns.length === 0 && (
          <p className="text-[11px] mt-2" style={{ color: '#f59e0b' }}>
            No grid-eligible columns configured. Edit this dashboard and pick fields that render in cells.
          </p>
        )}
      </div>

      {error && (
        <div
          className="rounded p-3 text-xs mb-3"
          style={{ background: 'rgba(248, 113, 113, 0.08)', color: '#f87171', border: '1px solid var(--admin-border)' }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-lg overflow-x-auto"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
      >
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--admin-bg)' }}>
              <Th>User</Th>
              {visibleColumns.map((c) => (
                <Th key={c.key} title={c.description}>{c.label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t" style={{ borderColor: 'var(--admin-border)' }}>
                <Td>
                  <Link
                    href={`/admin/users/${row.id}`}
                    className="text-xs font-medium"
                    style={{ color: '#60a5fa' }}
                  >
                    {row.id.substring(0, 8)}…
                  </Link>
                  <div className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                    {row.profile_type}
                  </div>
                </Td>
                {visibleColumns.map((c) => (
                  <Td key={c.key}>
                    <CellRenderer fieldKey={c.key} row={row} />
                  </Td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td className="p-6 text-center text-xs" colSpan={visibleColumns.length + 1} style={{ color: 'var(--admin-text-muted)' }}>
                  No users match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 mt-3 text-xs">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 rounded disabled:opacity-30"
            style={{ background: 'var(--admin-bg-elevated)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          >
            ← Prev
          </button>
          <span style={{ color: 'var(--admin-text-muted)' }}>page {page + 1} / {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
            className="px-3 py-1 rounded disabled:opacity-30"
            style={{ background: 'var(--admin-bg-elevated)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function CellRenderer({ fieldKey, row }: { fieldKey: string; row: GridRow }) {
  const def = getField(fieldKey);
  if (!def) return <span style={{ color: 'var(--admin-text-muted)' }}>—</span>;
  if (row.errors[fieldKey]) {
    return (
      <span
        title={row.errors[fieldKey]}
        style={{ color: '#f87171', fontSize: 10 }}
      >
        err
      </span>
    );
  }
  const value = row.values[fieldKey];
  if (def.Cell) {
    const Cell = def.Cell as React.ComponentType<{ value: unknown; userProfileType: string }>;
    return <Cell value={value} userProfileType={row.profile_type} />;
  }
  return <DefaultCell value={value} />;
}

function DefaultCell({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--admin-text-muted)' }}>—</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span
        style={{
          fontSize: 10,
          padding: '1px 6px',
          borderRadius: 3,
          background: value ? 'rgba(74,222,128,0.15)' : 'var(--admin-bg)',
          color: value ? '#4ade80' : 'var(--admin-text-muted)',
        }}
      >
        {value ? 'yes' : 'no'}
      </span>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--admin-text-muted)' }}>—</span>;
    return <span>{value.length} items</span>;
  }
  if (value instanceof Date) return <span>{value.toLocaleDateString()}</span>;
  if (typeof value === 'string' || typeof value === 'number') return <span>{value}</span>;
  return <span style={{ color: 'var(--admin-text-muted)' }}>…</span>;
}

function Th({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <th
      className="text-[10px] uppercase tracking-wider font-semibold px-3 py-2 text-left whitespace-nowrap"
      style={{ color: 'var(--admin-text-muted)' }}
      title={title}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2 align-top text-xs whitespace-nowrap">
      {children}
    </td>
  );
}
