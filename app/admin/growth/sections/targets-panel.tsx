'use client';

import { useState } from 'react';

export interface DecoratedTarget {
  id: string;
  marketId: string | null;
  type: 'driver' | 'rider';
  count: number;
  deadline: string;
  createdAt: string;
  label?: string;
  actual: number;
  expectedNow: number;
  requiredPerDayRemaining: number;
  onTrack: boolean;
  pctComplete: number;
  daysRemaining: number;
  projectedAtDeadline: number;
}

interface MarketLite {
  id: string;
  name: string;
}

interface Props {
  loading: boolean;
  targets: DecoratedTarget[];
  markets: MarketLite[];
  defaultMarketId: string | null;
  onChange: () => void;
}

export function TargetsPanel({ loading, targets, markets, defaultMarketId, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ type: 'driver' | 'rider'; count: string; deadline: string; label: string; marketId: string | '' }>({
    type: 'driver',
    count: '',
    deadline: '',
    label: '',
    marketId: defaultMarketId ?? '',
  });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        type: form.type,
        count: Number(form.count),
        deadline: form.deadline,
        label: form.label || undefined,
        marketId: form.marketId || null,
      };
      const res = await fetch('/api/admin/growth/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to save target');
        return;
      }
      setAdding(false);
      setForm({ type: 'driver', count: '', deadline: '', label: '', marketId: defaultMarketId ?? '' });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this target?')) return;
    const res = await fetch(`/api/admin/growth/targets?id=${id}`, { method: 'DELETE' });
    if (res.ok) onChange();
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-300">Acquisition Targets</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Set a goal, see required pace, manage by exception.
          </p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="px-3 py-1.5 text-xs font-medium bg-white text-black rounded-md hover:bg-neutral-200"
        >
          {adding ? 'Cancel' : '+ New Target'}
        </button>
      </div>

      {adding && (
        <div className="mb-4 p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Type</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as 'driver' | 'rider' })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
              >
                <option value="driver">Drivers</option>
                <option value="rider">Riders</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Count</span>
              <input
                type="number"
                min={1}
                value={form.count}
                onChange={(e) => setForm({ ...form, count: e.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
                placeholder="200"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Deadline</span>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Market</span>
              <select
                value={form.marketId}
                onChange={(e) => setForm({ ...form, marketId: e.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
              >
                <option value="">All markets</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Label (optional)</span>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
                placeholder="Spring push"
              />
            </label>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={submit}
            disabled={busy || !form.count || !form.deadline}
            className="px-4 py-1.5 text-xs font-medium bg-emerald-500 text-black rounded-md hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : 'Save Target'}
          </button>
        </div>
      )}

      {loading && targets.length === 0 ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : targets.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-neutral-500">No targets set yet.</p>
          <p className="text-xs text-neutral-600 mt-1">Create one to track required signup pace.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {targets.map((t) => <TargetRow key={t.id} target={t} markets={markets} onRemove={() => remove(t.id)} />)}
        </div>
      )}
    </div>
  );
}

function TargetRow({ target: t, markets, onRemove }: { target: DecoratedTarget; markets: MarketLite[]; onRemove: () => void }) {
  const marketName = t.marketId ? markets.find((m) => m.id === t.marketId)?.name ?? 'Market' : 'All markets';
  const accent = t.type === 'driver' ? '#a855f7' : '#22d3ee';
  const expectedPct = Math.min(100, Math.max(0, (t.expectedNow / t.count) * 100));
  const actualPct = Math.min(100, Math.max(0, t.pctComplete));
  const status = t.onTrack
    ? { tag: 'ON PACE', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' }
    : { tag: 'BEHIND', cls: 'bg-red-500/20 text-red-400 border-red-500/40' };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold capitalize" style={{ color: accent }}>{t.type}s</span>
            <span className="text-sm text-neutral-300">→ {t.count.toLocaleString()}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.cls}`}>{status.tag}</span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            {marketName} · deadline {t.deadline} · {t.daysRemaining}d left
            {t.label ? ` · ${t.label}` : ''}
          </p>
        </div>
        <button onClick={onRemove} className="text-xs text-neutral-500 hover:text-red-400">Delete</button>
      </div>

      {/* Progress bar with expected-tick overlay */}
      <div className="relative h-3 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-700"
          style={{ width: `${actualPct}%`, background: accent, opacity: 0.85 }}
        />
        {/* "where you should be today" marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white/70"
          style={{ left: `calc(${expectedPct}% - 1px)` }}
          title={`Expected today: ${t.expectedNow}`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <Stat label="Actual" value={`${t.actual.toLocaleString()}`} sub={`${t.pctComplete}% of goal`} />
        <Stat label="Expected today" value={`${t.expectedNow.toLocaleString()}`} sub={t.onTrack ? `+${t.actual - t.expectedNow} ahead` : `${t.actual - t.expectedNow} behind`} subColor={t.onTrack ? 'text-emerald-400' : 'text-red-400'} />
        <Stat label="Need / day" value={t.requiredPerDayRemaining.toFixed(1)} sub={`for next ${t.daysRemaining}d`} />
        <Stat label="Projected at deadline" value={`${t.projectedAtDeadline.toLocaleString()}`} sub={t.projectedAtDeadline >= t.count ? 'will hit goal' : `short by ${(t.count - t.projectedAtDeadline).toLocaleString()}`} subColor={t.projectedAtDeadline >= t.count ? 'text-emerald-400' : 'text-amber-400'} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${subColor ?? 'text-neutral-500'}`}>{sub}</p>}
    </div>
  );
}
