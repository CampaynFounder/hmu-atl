'use client';

import { useState } from 'react';

export type MarketStatus = 'setup' | 'soft_launch' | 'live' | 'paused';
const STATUSES: MarketStatus[] = ['setup', 'soft_launch', 'live', 'paused'];

const STATUS_LABELS: Record<MarketStatus, string> = {
  setup: 'Setup',
  soft_launch: 'Soft Launch',
  live: 'Live',
  paused: 'Paused',
};

const STATUS_COLORS: Record<MarketStatus, string> = {
  setup: '#9ca3af',        // grey
  soft_launch: '#f59e0b',  // amber
  live: '#00E676',         // green
  paused: '#ef4444',       // red
};

export interface AdminMarket {
  id: string;
  slug: string;
  name: string;
  subdomain: string | null;
  state: string | null;
  timezone: string | null;
  status: MarketStatus;
  launchDate: string | null;
  smsDid: string | null;
  smsAreaCode: string | null;
  centerLat: number | null;
  centerLng: number | null;
  radiusMiles: number | null;
  driverCount: number;
  riderCount: number;
  completedRides: number;
  areaCount: number;
  minDriversToLaunch: number;
}

export default function MarketsClient({ initialMarkets }: { initialMarkets: AdminMarket[] }) {
  const [markets, setMarkets] = useState<AdminMarket[]>(initialMarkets);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function changeStatus(id: string, nextStatus: MarketStatus) {
    const market = markets.find(m => m.id === id);
    if (!market || market.status === nextStatus) return;

    const prompt = nextStatus === 'live'
      ? `Flip ${market.name} to LIVE (public)? This exposes the market to all traffic on ${market.subdomain}.hmucashride.com.`
      : `Change ${market.name} status from ${market.status} to ${nextStatus}?`;
    if (!confirm(prompt)) return;

    setSaving(id);
    try {
      const res = await fetch(`/api/admin/markets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
        setToast({ kind: 'err', text: error || 'Save failed' });
        return;
      }
      const { market: updated } = await res.json() as { market: { status: MarketStatus; launch_date: string | null } };
      setMarkets(prev => prev.map(m => m.id === id
        ? { ...m, status: updated.status, launchDate: updated.launch_date }
        : m,
      ));
      setToast({ kind: 'ok', text: `${market.name} → ${nextStatus}` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 3500);
    }
  }

  return (
    <div style={{ padding: 24, color: 'var(--admin-text)' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Markets</h1>
        <p style={{ color: 'var(--admin-text-dim)', fontSize: 13 }}>
          Lifecycle status per market. <strong>setup</strong> = seeded, not public.
          <strong> soft_launch</strong> = pilot (signups allowed). <strong>live</strong> = public.
          <strong> paused</strong> = temporarily disabled.
        </p>
      </div>

      <div style={{
        border: '1px solid var(--admin-border)', borderRadius: 8,
        background: 'var(--admin-bg-elevated)', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--admin-border)', background: 'var(--admin-bg)' }}>
              <th style={thStyle}>Market</th>
              <th style={thStyle}>Subdomain</th>
              <th style={thStyle}>Drivers</th>
              <th style={thStyle}>Riders</th>
              <th style={thStyle}>Rides</th>
              <th style={thStyle}>Areas</th>
              <th style={thStyle}>Launched</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {markets.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--admin-text-dim)' }}>
                    {m.slug} · {m.state || '—'} · {m.timezone || '—'}
                  </div>
                </td>
                <td style={tdStyle}>
                  {m.subdomain ? (
                    <a
                      href={`https://${m.subdomain}.hmucashride.com`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--green, #00E676)', textDecoration: 'none' }}
                    >
                      {m.subdomain}.hmucashride.com ↗
                    </a>
                  ) : '—'}
                </td>
                <td style={tdStyle}>{m.driverCount}</td>
                <td style={tdStyle}>{m.riderCount}</td>
                <td style={tdStyle}>{m.completedRides}</td>
                <td style={tdStyle}>{m.areaCount}</td>
                <td style={tdStyle}>
                  {m.launchDate
                    ? new Date(m.launchDate).toLocaleDateString()
                    : <span style={{ color: 'var(--admin-text-dim)' }}>—</span>}
                </td>
                <td style={tdStyle}>
                  <select
                    value={m.status}
                    disabled={saving === m.id}
                    onChange={e => changeStatus(m.id, e.target.value as MarketStatus)}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--admin-bg)',
                      border: `1px solid ${STATUS_COLORS[m.status]}`,
                      borderRadius: 6,
                      color: STATUS_COLORS[m.status],
                      fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
                      textTransform: 'uppercase', cursor: 'pointer',
                    }}
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 50,
          padding: '12px 18px', borderRadius: 8,
          background: toast.kind === 'ok' ? '#00E676' : '#ef4444',
          color: toast.kind === 'ok' ? '#080808' : '#fff',
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

const thStyle = {
  textAlign: 'left' as const,
  padding: '12px 16px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase' as const,
  color: 'var(--admin-text-dim)',
};

const tdStyle = {
  padding: '12px 16px',
  verticalAlign: 'middle' as const,
};
