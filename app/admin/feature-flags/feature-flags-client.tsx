'use client';

import { useState } from 'react';
import type { FeatureFlag } from '@/lib/feature-flags';

interface Props {
  initialFlags: FeatureFlag[];
}

interface Draft {
  enabled: boolean;
  rollout_percentage: number;
  markets: string;  // comma-separated for editing; '' = null (all markets)
}

function flagToDraft(f: FeatureFlag): Draft {
  return {
    enabled: f.enabled,
    rollout_percentage: f.rollout_percentage,
    markets: (f.markets ?? []).join(', '),
  };
}

export default function FeatureFlagsClient({ initialFlags }: Props) {
  const [flags, setFlags] = useState<FeatureFlag[]>(initialFlags);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(initialFlags.map(f => [f.slug, flagToDraft(f)]))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function updateDraft(slug: string, patch: Partial<Draft>) {
    setDrafts(prev => ({ ...prev, [slug]: { ...prev[slug], ...patch } }));
  }

  async function save(slug: string) {
    const draft = drafts[slug];
    if (!draft) return;
    setSaving(slug);
    try {
      const marketsArr = draft.markets.trim()
        ? draft.markets.split(',').map(s => s.trim()).filter(Boolean)
        : null;
      const res = await fetch(`/api/admin/feature-flags/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: draft.enabled,
          rollout_percentage: draft.rollout_percentage,
          markets: marketsArr,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Save failed' }));
        setToast(error || 'Save failed');
        return;
      }
      const { flag } = await res.json() as { flag: FeatureFlag };
      setFlags(prev => prev.map(f => (f.slug === slug ? flag : f)));
      setDrafts(prev => ({ ...prev, [slug]: flagToDraft(flag) }));
      setToast('Saved');
    } catch {
      setToast('Network error');
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 2000);
    }
  }

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--admin-text)' }}>
          Feature Flags
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--admin-text-secondary)' }}>
          Toggle in-progress features. Disabled = zero user-visible change.
        </p>
      </header>

      {flags.length === 0 && (
        <p style={{ color: 'var(--admin-text-secondary)' }}>No flags defined.</p>
      )}

      <div className="space-y-4">
        {flags.map(flag => {
          const draft = drafts[flag.slug];
          const dirty =
            draft.enabled !== flag.enabled ||
            draft.rollout_percentage !== flag.rollout_percentage ||
            draft.markets !== (flag.markets ?? []).join(', ');
          return (
            <div
              key={flag.slug}
              className="rounded-xl p-5"
              style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold" style={{ color: 'var(--admin-text)' }}>
                      {flag.name}
                    </h2>
                    <code className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--admin-bg)', color: 'var(--admin-text-muted)' }}>
                      {flag.slug}
                    </code>
                  </div>
                  {flag.description && (
                    <p className="text-xs mt-1" style={{ color: 'var(--admin-text-secondary)' }}>
                      {flag.description}
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={e => updateDraft(flag.slug, { enabled: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span className="text-xs font-semibold" style={{ color: draft.enabled ? 'var(--admin-success, #00E676)' : 'var(--admin-text-muted)' }}>
                    {draft.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>
                    ROLLOUT %
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={draft.rollout_percentage}
                      onChange={e => updateDraft(flag.slug, { rollout_percentage: Number(e.target.value) })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.rollout_percentage}
                      onChange={e => updateDraft(flag.slug, { rollout_percentage: Math.max(0, Math.min(100, Number(e.target.value))) })}
                      className="w-16 px-2 py-1 text-sm rounded"
                      style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest block mb-1" style={{ color: 'var(--admin-text-faint)' }}>
                    MARKETS (blank = all)
                  </label>
                  <input
                    type="text"
                    value={draft.markets}
                    onChange={e => updateDraft(flag.slug, { markets: e.target.value })}
                    placeholder="atl, bham"
                    className="w-full px-3 py-1.5 text-sm rounded"
                    style={{ background: 'var(--admin-bg)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: 'var(--admin-text-muted)' }}>
                  Updated {new Date(flag.updated_at).toLocaleString()}
                </span>
                <button
                  onClick={() => save(flag.slug)}
                  disabled={!dirty || saving === flag.slug}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                  style={{ background: dirty ? 'var(--admin-accent, #448AFF)' : 'var(--admin-bg)', color: dirty ? 'white' : 'var(--admin-text-muted)' }}
                >
                  {saving === flag.slug ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg text-sm font-medium shadow-lg"
          style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', color: 'var(--admin-text)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
