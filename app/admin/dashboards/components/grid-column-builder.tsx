'use client';

// Drag-and-drop column builder for user_grid dashboards. Two panes:
//   - palette (left)  — every gridable field, grouped by category, searchable
//   - columns (right) — the picked fields in render order
// Drag from palette → drop in columns to add. Drag within columns to reorder.
// HTML5 drag and drop, no extra deps.
//
// Live preview below pulls 5 rows from /api/admin/dashboards/preview using
// the current column list, so the editor sees what they're about to save.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMarket } from '@/app/admin/components/market-context';

interface FieldMetadata {
  key: string;
  label: string;
  category: string;
  description?: string;
  applies_to: ('rider' | 'driver' | 'admin' | 'any')[];
  render: 'stat' | 'badge' | 'flag' | 'list';
  marketAware: boolean;
  deprecated: boolean;
  gridable: boolean;
}

interface PreviewRow {
  id: string;
  profile_type: string;
  values: Record<string, unknown>;
  errors: Record<string, string>;
}

export function GridColumnBuilder({
  fieldKeys,
  onChange,
  registry,
  categoryOrder,
}: {
  fieldKeys: string[];
  onChange: (next: string[]) => void;
  registry: FieldMetadata[];
  categoryOrder: string[];
}) {
  const { selectedMarketId } = useMarket();
  const [search, setSearch] = useState('');
  const [draggingFrom, setDraggingFrom] = useState<{ kind: 'palette' | 'columns'; key: string } | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Live preview
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const fieldByKey = useMemo(() => {
    const m = new Map<string, FieldMetadata>();
    for (const f of registry) m.set(f.key, f);
    return m;
  }, [registry]);

  const selectedSet = useMemo(() => new Set(fieldKeys), [fieldKeys]);

  // Palette: gridable fields not already picked, optionally filtered by search,
  // grouped by category in the registry's declared order.
  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = registry.filter((f) => {
      if (f.deprecated || !f.gridable) return false;
      if (selectedSet.has(f.key)) return false;
      if (!q) return true;
      return (
        f.key.toLowerCase().includes(q) ||
        f.label.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q)
      );
    });
    const byCat = new Map<string, FieldMetadata[]>();
    for (const f of filtered) {
      const arr = byCat.get(f.category) ?? [];
      arr.push(f);
      byCat.set(f.category, arr);
    }
    const order = categoryOrder.length > 0 ? categoryOrder : Array.from(byCat.keys());
    return order.filter((c) => byCat.has(c)).map((c) => ({ category: c, fields: byCat.get(c)! }));
  }, [registry, categoryOrder, search, selectedSet]);

  // Live preview, debounced.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (fieldKeys.length === 0) {
      setPreviewRows([]);
      setPreviewError(null);
      return;
    }
    debounce.current = setTimeout(() => {
      const params = new URLSearchParams({ fields: fieldKeys.join(',') });
      if (selectedMarketId) params.set('marketId', selectedMarketId);
      setPreviewLoading(true);
      setPreviewError(null);
      fetch(`/api/admin/dashboards/preview?${params.toString()}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
          return r.json() as Promise<{ rows: PreviewRow[] }>;
        })
        .then((d) => setPreviewRows(d.rows ?? []))
        .catch((e) => setPreviewError(e instanceof Error ? e.message : String(e)))
        .finally(() => setPreviewLoading(false));
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [fieldKeys, selectedMarketId]);

  // ─── Drag handlers ─────────────────────────────────────────────────────
  // overIndex is a *gap* index, semantically: 0 = before first row,
  // fieldKeys.length = after last row. Drop at overIndex inserts there.
  const onPaletteDragStart = (key: string) => () => setDraggingFrom({ kind: 'palette', key });
  const onColumnDragStart = (key: string) => () => setDraggingFrom({ kind: 'columns', key });
  const onDragEnd = () => { setDraggingFrom(null); setOverIndex(null); };

  // Compute insertion gap index from cursor Y relative to the row's bounding rect.
  // Top half → before this row (i); bottom half → after this row (i+1).
  const onRowDragOver = (i: number) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const beforeHalf = (e.clientY - rect.top) < rect.height / 2;
    setOverIndex(beforeHalf ? i : i + 1);
  };

  // For dropping past the last row (in the empty area below the list).
  const onContainerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (fieldKeys.length === 0) {
      e.preventDefault();
      setOverIndex(0);
    }
  };

  const performDrop = () => {
    const from = draggingFrom;
    const target = overIndex;
    setDraggingFrom(null);
    setOverIndex(null);
    if (!from || target === null) return;
    if (from.kind === 'palette') {
      const next = [...fieldKeys];
      next.splice(target, 0, from.key);
      onChange(next);
      return;
    }
    const fromIdx = fieldKeys.indexOf(from.key);
    if (fromIdx < 0) return;
    // No-op if dropping in the same gap or the gap immediately after itself.
    if (target === fromIdx || target === fromIdx + 1) return;
    const next = [...fieldKeys];
    next.splice(fromIdx, 1);
    // Removing fromIdx shifts later indices left by one.
    const insertAt = fromIdx < target ? target - 1 : target;
    next.splice(insertAt, 0, from.key);
    onChange(next);
  };

  const onContainerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    performDrop();
  };

  const removeColumn = (key: string) => {
    onChange(fieldKeys.filter((k) => k !== key));
  };

  const addToEnd = (key: string) => {
    if (selectedSet.has(key)) return;
    onChange([...fieldKeys, key]);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* ── Palette ─────────────────────────────────────────────────── */}
        <div
          className="lg:col-span-2 rounded-lg p-3"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
        >
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-xs font-semibold" style={{ color: 'var(--admin-text)' }}>Available fields</h3>
            <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>drag or click to add</span>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields…"
            className="w-full text-xs px-2 py-1.5 rounded outline-none mb-2"
            style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}
          />
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {grouped.map(({ category, fields }) => (
              <div key={category}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--admin-text-muted)' }}>
                  {category}
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {fields.map((f) => (
                    <div
                      key={f.key}
                      draggable
                      onDragStart={onPaletteDragStart(f.key)}
                      onDragEnd={onDragEnd}
                      onClick={() => addToEnd(f.key)}
                      title={f.description}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing"
                      style={{
                        background: 'var(--admin-bg)',
                        border: '1px solid var(--admin-border)',
                        color: 'var(--admin-text)',
                      }}
                    >
                      <span className="text-[11px] flex-1 truncate">{f.label}</span>
                      <code className="text-[9px]" style={{ color: 'var(--admin-text-muted)' }}>{f.key}</code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {grouped.length === 0 && (
              <p className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
                {search ? 'No fields match.' : 'All gridable fields are already picked.'}
              </p>
            )}
          </div>
        </div>

        {/* ── Columns ─────────────────────────────────────────────────── */}
        <div
          className="lg:col-span-3 rounded-lg p-3"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
        >
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-xs font-semibold" style={{ color: 'var(--admin-text)' }}>Columns ({fieldKeys.length})</h3>
            <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>drag to reorder · order = column order</span>
          </div>
          <div
            className="rounded p-2 min-h-[120px]"
            style={{ background: 'var(--admin-bg)', border: '1px dashed var(--admin-border)' }}
            onDragOver={onContainerDragOver}
            onDrop={onContainerDrop}
          >
            {fieldKeys.length === 0 ? (
              <div className="text-[11px] text-center py-6" style={{ color: 'var(--admin-text-muted)' }}>
                Drag a field here, or click any field on the left to add it.
              </div>
            ) : (
              <ul>
                {/* Gap before the first row. */}
                <DropGap active={overIndex === 0} />
                {fieldKeys.map((key, i) => {
                  const f = fieldByKey.get(key);
                  const isDragging = draggingFrom?.kind === 'columns' && draggingFrom.key === key;
                  return (
                    <li key={key} className="contents">
                      <div
                        draggable
                        onDragStart={onColumnDragStart(key)}
                        onDragEnd={onDragEnd}
                        onDragOver={onRowDragOver(i)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing"
                        style={{
                          background: 'var(--admin-bg-elevated)',
                          border: '1px solid var(--admin-border)',
                          color: 'var(--admin-text)',
                          opacity: isDragging ? 0.4 : 1,
                        }}
                      >
                        <span className="text-[10px] opacity-50 w-5">{i + 1}.</span>
                        <span className="text-xs flex-1">{f?.label ?? key}</span>
                        <code className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>{key}</code>
                        <button
                          type="button"
                          onClick={() => removeColumn(key)}
                          className="text-xs px-1.5 hover:opacity-100 opacity-60"
                          style={{ color: '#f87171' }}
                          aria-label={`Remove ${f?.label ?? key}`}
                        >
                          ×
                        </button>
                      </div>
                      {/* Gap below this row (i.e. insertion index i+1). */}
                      <DropGap active={overIndex === i + 1} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Preview ───────────────────────────────────────────────────── */}
      <div
        className="rounded-lg p-3"
        style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
      >
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-xs font-semibold" style={{ color: 'var(--admin-text)' }}>Preview (5 rows)</h3>
          <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
            {previewLoading ? 'Loading…' : `${previewRows.length} rows`}
          </span>
        </div>
        {previewError && (
          <div
            className="rounded p-2 text-[11px] mb-2"
            style={{ background: 'rgba(248, 113, 113, 0.08)', color: '#f87171', border: '1px solid var(--admin-border)' }}
          >
            {previewError}
          </div>
        )}
        {fieldKeys.length === 0 ? (
          <p className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
            Add a column to see a preview.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--admin-bg)' }}>
                  {fieldKeys.map((k) => (
                    <th key={k} className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 text-left whitespace-nowrap" style={{ color: 'var(--admin-text-muted)' }}>
                      {fieldByKey.get(k)?.label ?? k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: 'var(--admin-border)' }}>
                    {fieldKeys.map((k) => (
                      <td key={k} className="px-2 py-1.5 text-[11px] whitespace-nowrap">
                        <PreviewCell value={r.values[k]} error={r.errors[k]} />
                      </td>
                    ))}
                  </tr>
                ))}
                {previewRows.length === 0 && !previewLoading && (
                  <tr>
                    <td colSpan={fieldKeys.length} className="px-2 py-3 text-center text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
                      No users matched.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DropGap({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        height: active ? 6 : 4,
        margin: '2px 0',
        borderRadius: 3,
        background: active ? '#60a5fa' : 'transparent',
        transition: 'background 80ms, height 80ms',
      }}
    />
  );
}

function PreviewCell({ value, error }: { value: unknown; error?: string }) {
  if (error) return <span title={error} style={{ color: '#f87171' }}>err</span>;
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--admin-text-muted)' }}>—</span>;
  if (typeof value === 'boolean') return <span>{value ? 'yes' : 'no'}</span>;
  if (Array.isArray(value)) return <span>{value.length} items</span>;
  if (value instanceof Date) return <span>{value.toLocaleDateString()}</span>;
  if (typeof value === 'string' || typeof value === 'number') return <span>{String(value)}</span>;
  return <span style={{ color: 'var(--admin-text-muted)' }}>…</span>;
}
