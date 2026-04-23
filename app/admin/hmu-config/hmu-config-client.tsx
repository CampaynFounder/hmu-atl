'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMarket } from '@/app/admin/components/market-context';

interface ConfigRow {
  config_key: string;
  config_value: Record<string, unknown>;
  updated_at: string;
}

// Config rows are global today (no per-market override). When the schema grows a
// market_id column on platform_config, this UI can start scoping per-market.
export default function HmuConfigClient() {
  const { selectedMarket } = useMarket();
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/hmu-config');
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
        const initialDrafts: Record<string, string> = {};
        for (const r of (data.rows ?? []) as ConfigRow[]) {
          initialDrafts[r.config_key] = JSON.stringify(r.config_value, null, 2);
        }
        setDrafts(initialDrafts);
      } else {
        setError('Failed to load config');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = useCallback(async (key: string) => {
    setSaving(key);
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(drafts[key]);
    } catch {
      setError(`${key}: invalid JSON`);
      setSaving(null);
      return;
    }
    try {
      const res = await fetch('/api/admin/hmu-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_key: key, config_value: parsed }),
      });
      if (res.ok) {
        setToast(`${key} saved`);
        window.setTimeout(() => setToast(null), 2000);
        fetchConfig();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Save failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(null);
    }
  }, [drafts, fetchConfig]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">HMU Config</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Tunable limits for the HMU/Link feature. Values are JSON objects — e.g.{' '}
          <code className="bg-neutral-800 px-1 rounded">{'{"value": 20}'}</code>.
        </p>
        <p className="text-[11px] text-neutral-600 mt-2">
          Scope: <span className="text-neutral-400">Global</span>
          {selectedMarket && <> — viewing as <span className="text-neutral-400">{selectedMarket.name}</span>,</>}
          {' '}market override coming soon.
        </p>
      </div>

      {toast && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-sm text-green-400">
          {toast}
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-neutral-500 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-neutral-500 text-sm">No hmu.* config rows found.</div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div
              key={row.config_key}
              className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div>
                  <code className="text-sm font-semibold text-white">{row.config_key}</code>
                  <div className="text-[11px] text-neutral-600 mt-0.5">
                    Updated {new Date(row.updated_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <textarea
                value={drafts[row.config_key] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [row.config_key]: e.target.value }))}
                rows={3}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleSave(row.config_key)}
                  disabled={saving === row.config_key || drafts[row.config_key] === JSON.stringify(row.config_value, null, 2)}
                  className="bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-neutral-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
                >
                  {saving === row.config_key ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setDrafts((d) => ({ ...d, [row.config_key]: JSON.stringify(row.config_value, null, 2) }))}
                  disabled={drafts[row.config_key] === JSON.stringify(row.config_value, null, 2)}
                  className="text-xs text-neutral-500 hover:text-white disabled:text-neutral-700 px-3 py-1.5"
                >
                  Reset
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
