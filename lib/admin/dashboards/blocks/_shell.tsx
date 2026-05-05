// Shared visual chrome for blocks. Keeps the look consistent across the
// registry — title + optional subtitle + bordered card. Blocks render their
// own body inside.

import type { ReactNode } from 'react';

export function BlockShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-4 h-full"
      style={{
        background: 'var(--admin-bg-elevated)',
        border: '1px solid var(--admin-border)',
      }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--admin-text)' }}>{title}</div>
          {subtitle && (
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>{subtitle}</div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
      {children}
    </span>
  );
}

export function Pill({
  color,
  children,
  title,
}: {
  color?: string;
  children: ReactNode;
  title?: string;
}) {
  const c = color ?? 'var(--admin-text-muted)';
  return (
    <span
      title={title}
      className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1"
      style={{
        background: color ? `${color}1f` : 'var(--admin-bg)',
        color: c,
        border: '1px solid var(--admin-border)',
      }}
    >
      {children}
    </span>
  );
}

export function StatGrid({
  cols = 4,
  stats,
}: {
  cols?: 2 | 3 | 4;
  stats: { label: string; value: ReactNode; tone?: 'good' | 'bad' }[];
}) {
  const gridCols = cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4';
  return (
    <div className={`grid grid-cols-2 ${gridCols} gap-3`}>
      {stats.map((s, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>
            {s.label}
          </span>
          <span
            className="text-sm font-medium"
            style={{
              color: s.tone === 'bad' ? '#f87171' : s.tone === 'good' ? '#4ade80' : 'var(--admin-text)',
            }}
          >
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}
