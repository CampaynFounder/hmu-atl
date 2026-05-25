'use client';

// Stream D — admin blast index client.
// Auto-refreshes every 15s when active blasts exist.

import { useEffect, useRef, useState, useCallback } from 'react';
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
  expiresAt: string | null;
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
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(delta / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function expiresIn(iso: string | null): string | null {
  if (!iso) return null;
  const delta = new Date(iso).getTime() - Date.now();
  if (delta <= 0) return 'expired';
  const mins = Math.ceil(delta / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.ceil(mins / 60)}h left`;
}

export function AdminBlastIndexClient() {
  const [blasts, setBlasts] = useState<BlastRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [funnelFilter, setFunnelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [, setTick] = useState(0);
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    cancelRef.current = false;
    setError(null);
    try {
      const params = new URLSearchParams();
      if (funnelFilter) params.set('funnel_filter', funnelFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/blast?${params}`);
      if (!res.ok) {
        if (!cancelRef.current) setError('Could not load blasts.');
        return;
      }
      const body = await res.json();
      if (!cancelRef.current) {
        setBlasts(body.blasts ?? []);
        setLastRefresh(new Date());
      }
    } catch {
      if (!cancelRef.current) setError('Network error.');
    }
  }, [funnelFilter, statusFilter]);

  // Initial + filter-change load
  useEffect(() => {
    setBlasts(null);
    load();
    return () => { cancelRef.current = true; };
  }, [load]);

  // Auto-refresh every 15s when active blasts exist
  useEffect(() => {
    const hasActive = blasts?.some((b) => b.status === 'active');
    if (!hasActive) return;
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [blasts, load]);

  // Relative-time ticker — updates display every 30s
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Active blasts always first
  const sorted = blasts
    ? [...blasts].sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
    : null;

  const activeBlasts = sorted?.filter((b) => b.status === 'active') ?? [];
  const hasActive = activeBlasts.length > 0;

  return (
    <div style={{ padding: 24, color: '#fff', fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 32, margin: 0 }}>
          Blast Monitor
        </h1>
        {hasActive && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#00E676', fontWeight: 700 }}>
            <LiveDot /> LIVE · auto-refreshing
          </span>
        )}
        {lastRefresh && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>
            Updated {relativeTime(lastRefresh.toISOString())}
          </span>
        )}
      </div>

      {/* Live active blast callout */}
      {hasActive && (
        <div style={{
          marginBottom: 20, padding: '14px 18px', borderRadius: 12,
          border: '1px solid rgba(0,230,118,0.25)', background: 'rgba(0,230,118,0.06)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00E676', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            Active now — {activeBlasts.length} blast{activeBlasts.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeBlasts.map((b) => {
              const left = expiresIn(b.expiresAt);
              const health: HealthStatus = b.notifiedCount === 0 ? 'dead' : b.hmuCount === 0 ? 'slow' : 'ok';
              return (
                <Link key={b.id} href={`/admin/blast/${b.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <HealthDot health={health} />
                    <span style={{ flex: 1, fontSize: 13, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.pickupAddress ?? 'Unknown pickup'} → {b.dropoffAddress ?? 'Unknown drop'}
                    </span>
                    <span style={{ fontFamily: "'Space Mono', monospace", color: '#00E676', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      ${b.priceDollars}
                    </span>
                    <FunnelMini
                      targeted={b.targetedCount}
                      notified={b.notifiedCount}
                      hmu={b.hmuCount}
                      selected={b.selectedCount}
                    />
                    {left && (
                      <span style={{ fontSize: 11, color: left === 'expired' ? '#FF4444' : 'rgba(255,255,255,0.45)', flexShrink: 0 }}>
                        {left}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#00E676', flexShrink: 0 }}>View →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <FilterChips label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUSES} />
        <FilterChips label="Funnel" value={funnelFilter} onChange={setFunnelFilter} options={FILTERS} />
      </div>

      {error && <p style={{ color: '#FF8A8A' }}>{error}</p>}
      {sorted === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ShimmerSlot height={48} radius={10} />
          <ShimmerSlot height={48} radius={10} />
          <ShimmerSlot height={48} radius={10} />
        </div>
      )}

      {sorted && sorted.length === 0 && !error && (
        <p style={{ color: 'rgba(255,255,255,0.55)' }}>No blasts match the current filters.</p>
      )}

      {sorted && sorted.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.55)' }}>
                {['', 'Created', 'Status', 'Route', '$', 'Pool → Notified → HMU → Selected', 'Offer Views', 'Expires'].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => {
                const isActive = b.status === 'active';
                const left = expiresIn(b.expiresAt);
                const health: HealthStatus = isActive
                  ? (b.notifiedCount === 0 ? 'dead' : b.hmuCount === 0 ? 'slow' : 'ok')
                  : 'off';
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: isActive ? 'rgba(0,230,118,0.025)' : undefined }}>
                    <td style={CELL}>
                      {isActive && <HealthDot health={health} />}
                    </td>
                    <td style={CELL}>
                      <Link href={`/admin/blast/${b.id}`} style={{ color: '#00E676', textDecoration: 'none' }}>
                        {relativeTime(b.createdAt)}
                      </Link>
                    </td>
                    <td style={CELL}><StatusPill status={b.status} /></td>
                    <td style={{ ...CELL, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.pickupAddress ?? '—'} → {b.dropoffAddress ?? '—'}
                    </td>
                    <td style={{ ...CELL, fontFamily: "'Space Mono', monospace" }}>${b.priceDollars}</td>
                    <td style={CELL}>
                      <FunnelMini
                        targeted={b.targetedCount}
                        notified={b.notifiedCount}
                        hmu={b.hmuCount}
                        selected={b.selectedCount}
                      />
                    </td>
                    <td style={CELL}>{b.offerPageViews}</td>
                    <td style={{ ...CELL, color: left === 'expired' ? '#FF4444' : 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                      {left ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LiveDot() {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 8 }}>
      <span style={{
        position: 'absolute', inset: 0, borderRadius: '50%', background: '#00E676',
        animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.6,
      }} />
      <span style={{ position: 'absolute', inset: 1, borderRadius: '50%', background: '#00E676' }} />
      <style>{`@keyframes ping { 0% { transform: scale(1); opacity: 0.6; } 75%,100% { transform: scale(2); opacity: 0; } }`}</style>
    </span>
  );
}

type HealthStatus = 'ok' | 'slow' | 'dead' | 'off';

function HealthDot({ health }: { health: HealthStatus }) {
  const c = health === 'ok' ? '#00E676' : health === 'slow' ? '#FFB300' : health === 'dead' ? '#FF4444' : 'transparent';
  const label = health === 'ok' ? 'Receiving HMUs' : health === 'slow' ? 'Notified — waiting for HMU' : health === 'dead' ? 'No drivers notified' : '';
  return (
    <span title={label} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
  );
}

function FunnelMini({ targeted, notified, hmu, selected }: {
  targeted: number; notified: number; hmu: number; selected: number;
}) {
  return (
    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
      <span title="Pool">{targeted}</span>
      <span style={{ color: 'rgba(255,255,255,0.3)' }}> → </span>
      <span title="Notified" style={{ color: notified > 0 ? '#448AFF' : undefined }}>{notified}</span>
      <span style={{ color: 'rgba(255,255,255,0.3)' }}> → </span>
      <span title="HMU" style={{ color: hmu > 0 ? '#00E676' : undefined }}>{hmu}</span>
      <span style={{ color: 'rgba(255,255,255,0.3)' }}> → </span>
      <span title="Selected" style={{ color: selected > 0 ? '#A855F7' : undefined }}>{selected}</span>
    </span>
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
            padding: '6px 12px', margin: '0 4px', borderRadius: 14, border: '1px solid',
            borderColor: value === o.value ? '#00E676' : 'rgba(255,255,255,0.12)',
            background: value === o.value ? 'rgba(0,230,118,0.15)' : 'transparent',
            color: value === o.value ? '#00E676' : 'rgba(255,255,255,0.78)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
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

const CELL: React.CSSProperties = { padding: '10px 8px', verticalAlign: 'middle' };
