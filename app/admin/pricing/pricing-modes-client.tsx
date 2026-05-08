'use client';

import { useEffect, useState } from 'react';
import DepositOnlyForm, { type DepositOnlyConfig } from './mode-forms/deposit-only-form';
import LegacyFullFareInfo from './mode-forms/legacy-full-fare-info';

interface PricingMode {
  id: string;
  modeKey: string;
  displayName: string;
  description: string | null;
  enabled: boolean;
  isDefaultGlobal: boolean;
  hidesSubscription: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

export default function PricingModesClient() {
  const [modes, setModes] = useState<PricingMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pricing-modes');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setModes(data.modes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function patchMode(modeKey: string, body: Record<string, unknown>) {
    setSavingKey(modeKey);
    setError(null);
    try {
      const res = await fetch('/api/admin/pricing-modes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modeKey, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingKey(null);
    }
  }

  function handleSaveDepositOnly(modeKey: string, config: DepositOnlyConfig) {
    patchMode(modeKey, { config: config as unknown as Record<string, unknown> });
  }

  if (loading) return <div className="text-neutral-400">Loading pricing modes…</div>;

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Pricing Modes</h2>
        <p className="text-sm text-neutral-400">
          Each mode defines a different money-movement model. Exactly one is the global default — users not assigned to a cohort fall back to it. Cohort assignments override the default at the user level (managed under <span className="font-mono">/admin/pricing/cohorts</span> when Phase C ships).
        </p>
      </header>

      {error && <div className="rounded border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}

      <div className="space-y-4">
        {modes.map((m) => (
          <div key={m.id} className="rounded border border-neutral-800 p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-mono text-sm font-semibold">{m.modeKey}</h3>
                  {m.isDefaultGlobal && (
                    <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300">DEFAULT</span>
                  )}
                  {!m.enabled && (
                    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">DISABLED</span>
                  )}
                  {m.hidesSubscription && (
                    <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">HIDES HMU FIRST</span>
                  )}
                </div>
                <div className="text-sm text-neutral-300">{m.displayName}</div>
                {m.description && <div className="text-xs text-neutral-500">{m.description}</div>}
              </div>
              <div className="text-xs text-neutral-500 whitespace-nowrap">
                updated {new Date(m.updatedAt).toLocaleString()}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                disabled={savingKey === m.modeKey}
                onClick={() => patchMode(m.modeKey, { enabled: !m.enabled })}
                className="rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-900 disabled:opacity-50"
              >
                {m.enabled ? 'Disable mode' : 'Enable mode'}
              </button>
              <button
                disabled={savingKey === m.modeKey || m.isDefaultGlobal}
                onClick={() => patchMode(m.modeKey, { isDefaultGlobal: true })}
                className="rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-900 disabled:opacity-50"
              >
                {m.isDefaultGlobal ? 'Already default' : 'Set as global default'}
              </button>
              <button
                disabled={savingKey === m.modeKey}
                onClick={() => patchMode(m.modeKey, { hidesSubscription: !m.hidesSubscription })}
                className="rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-900 disabled:opacity-50"
              >
                {m.hidesSubscription ? "Don't hide HMU First" : 'Hide HMU First UI'}
              </button>
            </div>

            <ModeConfigSection
              mode={m}
              saving={savingKey === m.modeKey}
              onSaveDepositOnly={(cfg) => handleSaveDepositOnly(m.modeKey, cfg)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ModeConfigSection({
  mode,
  saving,
  onSaveDepositOnly,
}: {
  mode: PricingMode;
  saving: boolean;
  onSaveDepositOnly: (cfg: DepositOnlyConfig) => void;
}) {
  if (mode.modeKey === 'deposit_only') {
    return <DepositOnlyForm initial={mode.config ?? {}} saving={saving} onSave={onSaveDepositOnly} />;
  }
  if (mode.modeKey === 'legacy_full_fare') {
    return <LegacyFullFareInfo />;
  }
  return (
    <div className="rounded border border-amber-900/50 bg-amber-950/20 p-3 text-[11px] text-amber-300">
      No config form is implemented for <span className="font-mono">{mode.modeKey}</span>. Add one under{' '}
      <span className="font-mono">app/admin/pricing/mode-forms/</span> before this mode can be tuned from admin.
    </div>
  );
}
