'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useMarket } from '@/app/admin/components/market-context';

interface Flag {
  id: string;
  flag_key: string;
  market_id: string;
  market_slug: string;
  audience: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

export default function FlagsPage() {
  const { selectedMarketId } = useMarket();
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchFlags = useCallback(() => {
    const qs = selectedMarketId ? `?market_id=${selectedMarketId}` : '';
    fetch(`/api/admin/funnel/flags${qs}`)
      .then((r) => r.json())
      .then((data) => setFlags(data.flags || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedMarketId]);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  const toggleFlag = async (flagId: string, enabled: boolean) => {
    await fetch('/api/admin/funnel/flags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag_id: flagId, enabled }),
    });
    fetchFlags();
  };

  const createFlag = async () => {
    if (!newKey || !selectedMarketId) return;
    setCreating(true);
    await fetch('/api/admin/funnel/flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag_key: newKey, market_id: selectedMarketId, description: newDesc || null }),
    });
    setNewKey('');
    setNewDesc('');
    setCreating(false);
    fetchFlags();
  };

  return (
    <div style={{ padding: '24px', maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/funnel" style={{ color: 'var(--admin-text-muted)', textDecoration: 'none', fontSize: 14 }}>
          &larr; Funnel CMS
        </Link>
        <span style={{ color: 'var(--admin-text-faint)' }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--admin-text)' }}>Feature Flags</h1>
      </div>

      {/* Create new flag */}
      <div style={{
        padding: 20, borderRadius: 12, marginBottom: 24,
        background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 12 }}>
          Create Flag
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="flag_key (e.g. driver_landing.pricing_section)"
            style={{
              flex: 2, padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
              color: 'var(--admin-text)',
            }}
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            style={{
              flex: 2, padding: '8px 12px', borderRadius: 6, fontSize: 13,
              background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
              color: 'var(--admin-text)',
            }}
          />
          <button
            onClick={createFlag}
            disabled={creating || !newKey}
            style={{
              padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: '#00E676', color: '#000', border: 'none', cursor: 'pointer',
              opacity: creating || !newKey ? 0.5 : 1,
            }}
          >
            Create
          </button>
        </div>
      </div>

      {/* Flag list */}
      {loading ? (
        <div style={{ color: 'var(--admin-text-muted)', padding: 40, textAlign: 'center' }}>Loading...</div>
      ) : flags.length === 0 ? (
        <div style={{ color: 'var(--admin-text-muted)', padding: 40, textAlign: 'center', fontSize: 13 }}>
          No feature flags created yet
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {flags.map((flag) => (
            <div
              key={flag.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '14px 20px', borderRadius: 10,
                background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)', fontFamily: 'monospace' }}>
                  {flag.flag_key}
                </div>
                {flag.description && (
                  <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 2 }}>
                    {flag.description}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--admin-text-faint)', marginTop: 2 }}>
                  {flag.audience} &middot; Updated {new Date(flag.updated_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => toggleFlag(flag.id, !flag.enabled)}
                style={{
                  width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: flag.enabled ? '#00E676' : 'rgba(255,255,255,0.1)',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', position: 'absolute', top: 3,
                  left: flag.enabled ? 25 : 3, transition: 'left 0.2s',
                }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
