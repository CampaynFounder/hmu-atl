'use client';

import { useEffect, useState, useCallback } from 'react';

interface ConfigRow {
  config_key: string;
  config_value: Record<string, unknown>;
  updated_at: string;
}

const KEY_DESCRIPTIONS: Record<string, string> = {
  blast_matching_v1:
    'Matching algorithm — weights (sum to ~1.0), absolute filters, fanout limits, expiry, and deposit policy. Drives which drivers get notified for each blast.',
  'blast.sms_kill_switch':
    'Global kill switch for blast SMS. Set value=true to disable all SMS fanout (push-only).',
  'blast.max_sms_per_blast':
    'Hard ceiling on SMS sends per blast, regardless of matching algorithm output.',
  'blast.rate_limit_per_phone_hour':
    'Max blasts a single phone number can send per rolling hour.',
  'blast.rate_limit_per_phone_day':
    'Max blasts a single phone number can send per rolling day.',
  'blast.draft_ttl_minutes':
    'How long the rider in-progress blast form persists in localStorage before clearing.',
};

export default function BlastConfigClient() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/blast-config');
      if (res.ok) {
        const data = await res.json();
        const rs = (data.rows ?? []) as ConfigRow[];
        setRows(rs);
        const initialDrafts: Record<string, string> = {};
        for (const r of rs) {
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

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = useCallback(
    async (key: string) => {
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
        const res = await fetch('/api/admin/blast-config', {
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
    },
    [drafts, fetchConfig],
  );

  const isMatchingRow = (key: string) => key === 'blast_matching_v1';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Blast Config</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Tunable knobs for the blast booking flow. The big{' '}
          <code className="bg-neutral-800 px-1 rounded">blast_matching_v1</code> row drives
          which drivers get notified per blast. Cache TTL is 60s — changes propagate
          within a minute.
        </p>
        <p className="text-[11px] text-neutral-600 mt-2">
          Spec: <code className="bg-neutral-800 px-1 rounded">docs/BLAST-BOOKING-SPEC.md</code>
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
        <div className="text-neutral-500 text-sm">
          No blast config rows found. Did the migration run?
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const big = isMatchingRow(row.config_key);
            const desc = KEY_DESCRIPTIONS[row.config_key];
            const dirty =
              drafts[row.config_key] !== JSON.stringify(row.config_value, null, 2);
            return (
              <div
                key={row.config_key}
                className={`bg-neutral-900 border rounded-xl p-4 ${
                  big ? 'border-amber-500/40' : 'border-neutral-800'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <div>
                    <code className="text-sm font-semibold text-white">
                      {row.config_key}
                    </code>
                    {big && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                        Algorithm
                      </span>
                    )}
                    <div className="text-[11px] text-neutral-600 mt-0.5">
                      Updated {new Date(row.updated_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                {desc && (
                  <p className="text-xs text-neutral-500 mb-2 leading-relaxed">{desc}</p>
                )}
                <textarea
                  value={drafts[row.config_key] ?? ''}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [row.config_key]: e.target.value }))
                  }
                  rows={big ? 24 : 4}
                  spellCheck={false}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleSave(row.config_key)}
                    disabled={saving === row.config_key || !dirty}
                    className="bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-neutral-600 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {saving === row.config_key ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() =>
                      setDrafts((d) => ({
                        ...d,
                        [row.config_key]: JSON.stringify(row.config_value, null, 2),
                      }))
                    }
                    disabled={!dirty}
                    className="text-xs text-neutral-500 hover:text-white disabled:text-neutral-700 px-3 py-1.5"
                  >
                    Reset
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
