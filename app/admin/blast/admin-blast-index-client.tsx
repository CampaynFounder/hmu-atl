'use client';

// Stream D — admin blast index client.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShimmerSlot } from '@/components/blast/motion';

interface BlastRow {
  id: string;
  status: string;
  marketId: string | null;
  priceDollars: number;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  scheduledFor: string | null;
  createdAt: string;
  targetedCount: number;
  notifiedCount: number;
  hmuCount: number;
  selectedCount: number;
  pullUpCount: number;
  feedImpressions: number;
  offerPageViews: number;
}

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'notified_under_3', label: 'Notified < 3' },
  { value: 'zero_offer_views', label: '0 offer views' },
  { value: 'no_response', label: 'No HMU response' },
];

const STATUSES: { value: string; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'active', label: 'Active' },
  { value: 'matched', label: 'Matched' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
];

export function AdminBlastIndexClient() {
  const [blasts, setBlasts] = useState<BlastRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [funnelFilter, setFunnelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBlasts(null);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (funnelFilter) params.set('funnel_filter', funnelFilter);
        if (statusFilter) params.set('status', statusFilter);
        const res = await fetch(`/api/admin/blast?${params}`);
        if (!res.ok) {
          if (!cancelled) setError('Could not load blasts.');
          return;
        }
        const body = await res.json();
        if (!cancelled) setBlasts(body.blasts ?? []);
      } catch {
        if (!cancelled) setError('Network error.');
      }
    })();
    return () => { cancelled = true; };
  }, [funnelFilter, statusFilter]);

  return (
    <div style={{ padding: 24, color: '#fff', fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      <h1 style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 32, margin: '0 0 16px' }}>
        Blast Observability
      </h1>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <FilterChips label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUSES} />
        <FilterChips label="Funnel" value={funnelFilter} onChange={setFunnelFilter} options={FILTERS} />
      </div>

      {error && <p style={{ color: '#FF8A8A' }}>{error}</p>}
      {blasts === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ShimmerSlot height={48} radius={10} />
          <ShimmerSlot height={48} radius={10} />
          <ShimmerSlot height={48} radius={10} />
        </div>
      )}

      {blasts && blasts.length === 0 && !error && (
        <p style={{ color: 'rgba(255,255,255,0.55)' }}>No blasts match the current filters.</p>
      )}

      {blasts && blasts.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.55)' }}>
                {['Created', 'Status', 'Route', 'Price', 'Targeted', 'Notified', 'HMU', 'Selected', 'PullUp', 'Impressions', 'Offer Views'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blasts.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={CELL}>
                    <Link href={`/admin/blast/${b.id}`} style={{ color: '#00E676', textDecoration: 'none' }}>
                      {new Date(b.createdAt).toLocaleString()}
                    </Link>
                  </td>
                  <td style={CELL}><StatusPill status={b.status} /></td>
                  <td style={{ ...CELL, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.pickupAddress ?? '—'} → {b.dropoffAddress ?? '—'}
                  </td>
                  <td style={{ ...CELL, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>${b.priceDollars}</td>
                  <td style={CELL}>{b.targetedCount}</td>
                  <td style={CELL}>{b.notifiedCount}</td>
                  <td style={CELL}>{b.hmuCount}</td>
                  <td style={CELL}>{b.selectedCount}</td>
                  <td style={CELL}>{b.pullUpCount}</td>
                  <td style={CELL}>{b.feedImpressions}</td>
                  <td style={CELL}>{b.offerPageViews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChips({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginRight: 8 }}>{label}:</span>
      {options.map((o) => (
        <button
          key={o.value || 'all'}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            padding: '6px 12px',
            margin: '0 4px',
            borderRadius: 14,
            border: '1px solid',
            borderColor: value === o.value ? '#00E676' : 'rgba(255,255,255,0.12)',
            background: value === o.value ? 'rgba(0,230,118,0.15)' : 'transparent',
            color: value === o.value ? '#00E676' : 'rgba(255,255,255,0.78)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: '#00E676', matched: '#448AFF', completed: '#888',
    cancelled: '#FF4444', expired: '#FFB300',
  };
  const c = colors[status] ?? '#888';
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 100,
      background: `${c}22`, color: c, fontSize: 11, fontWeight: 700,
      letterSpacing: 0.5, textTransform: 'uppercase',
    }}>{status}</span>
  );
}

const CELL: React.CSSProperties = { padding: '10px 8px', verticalAlign: 'top' };
