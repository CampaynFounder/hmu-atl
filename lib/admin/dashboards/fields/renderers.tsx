// Generic field renderers shared across categories. Most fields use one of
// these via a thin wrapper that just passes formatted props.

import type { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: 'good' | 'bad' | 'warn' | 'muted';
  hint?: string;
}) {
  const color =
    tone === 'bad' ? '#f87171' :
    tone === 'good' ? '#4ade80' :
    tone === 'warn' ? '#f59e0b' :
    tone === 'muted' ? 'var(--admin-text-muted)' :
    'var(--admin-text)';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>
        {label}
      </span>
      <span className="text-sm font-medium" style={{ color }} title={hint}>
        {value === null || value === undefined || value === '' ? '—' : value}
      </span>
    </div>
  );
}

export function BadgeChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string | null | undefined;
  color?: string;
}) {
  const c = color ?? 'var(--admin-text-muted)';
  if (value == null || value === '') {
    return <StatTile label={label} value="—" tone="muted" />;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>
        {label}
      </span>
      <span
        className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded inline-block w-fit"
        style={{
          background: color ? `${color}1f` : 'var(--admin-bg)',
          color: c,
          border: '1px solid var(--admin-border)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function FlagChip({
  label,
  active,
  activeText,
  color,
}: {
  label: string;
  active: boolean;
  activeText?: string;
  color?: string;
}) {
  if (!active) {
    return <StatTile label={label} value="no" tone="muted" />;
  }
  const c = color ?? '#4ade80';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>
        {label}
      </span>
      <span
        className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded inline-block w-fit"
        style={{
          background: `${c}1f`,
          color: c,
          border: '1px solid var(--admin-border)',
        }}
      >
        {activeText ?? 'yes'}
      </span>
    </div>
  );
}

export function FieldList<T>({
  label,
  items,
  emptyText,
  renderRow,
}: {
  label: string;
  items: T[];
  emptyText?: string;
  renderRow: (item: T, idx: number) => ReactNode;
}) {
  return (
    <div className="col-span-full">
      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--admin-text-muted)' }}>
        {label}
      </div>
      {items.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
          {emptyText ?? '—'}
        </div>
      ) : (
        <div
          className="rounded divide-y"
          style={{
            border: '1px solid var(--admin-border)',
            background: 'var(--admin-bg)',
          }}
        >
          {items.map((item, idx) => (
            <div key={idx} className="px-3 py-2">
              {renderRow(item, idx)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChipRow({
  label,
  chips,
  emptyText,
}: {
  label: string;
  chips: { text: string; color?: string; title?: string }[];
  emptyText?: string;
}) {
  return (
    <div className="col-span-full">
      <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--admin-text-muted)' }}>
        {label}
      </div>
      {chips.length === 0 ? (
        <div className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
          {emptyText ?? '—'}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded"
              title={c.title}
              style={{
                background: c.color ? `${c.color}1f` : 'var(--admin-bg)',
                color: c.color ?? 'var(--admin-text)',
                border: '1px solid var(--admin-border)',
              }}
            >
              {c.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Helpers for tone selection
export function toneForCount(n: number, badThreshold: number, warnThreshold: number): 'bad' | 'warn' | undefined {
  if (n >= badThreshold) return 'bad';
  if (n >= warnThreshold) return 'warn';
  return undefined;
}

export function fmtDate(d: Date | string | null): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString();
}

export function fmtDateTime(d: Date | string | null): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleString();
}

export function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${Number(n).toFixed(2)}`;
}
