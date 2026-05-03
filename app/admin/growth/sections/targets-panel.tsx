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
  campaignName?: string;
  utmCampaign?: string;
  metaSpend: number;
  googleSpend: number;
  totalSpend: number;
  // Per-channel attribution (0 when utmCampaign unset)
  attributedMeta: number;
  attributedGoogle: number;
  attributedOther: number;
  attributedTotal: number;
  untracked: number;
  // CAC suite — one of these will be non-null depending on whether utmCampaign is set
  metaCac: number | null;
  googleCac: number | null;
  campaignCac: number | null;
  blendedCac: number | null;
  requiredAdditionalSpend: number | null;
  remainingSignups: number;
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

type FormState = {
  type: 'driver' | 'rider';
  count: string;
  deadline: string;
  label: string;
  marketId: string | '';
  campaignName: string;
  utmCampaign: string;
  metaSpend: string;
  googleSpend: string;
};

const emptyForm = (defaultMarketId: string | null): FormState => ({
  type: 'driver',
  count: '',
  deadline: '',
  label: '',
  marketId: defaultMarketId ?? '',
  campaignName: '',
  utmCampaign: '',
  metaSpend: '',
  googleSpend: '',
});

const UTM_CAMPAIGN_RE = /^[a-z0-9_-]{1,40}$/;

export function TargetsPanel({ loading, targets, markets, defaultMarketId, onChange }: Props) {
  // editingId: null = closed, '' = creating new, '<id>' = editing that target
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(defaultMarketId));

  const isCreating = editingId === '';
  const isEditing = editingId !== null && editingId !== '';

  function openCreate() {
    setError(null);
    setForm(emptyForm(defaultMarketId));
    setEditingId('');
  }

  function openEdit(t: DecoratedTarget) {
    setError(null);
    setForm({
      type: t.type,
      count: String(t.count),
      deadline: t.deadline,
      label: t.label ?? '',
      marketId: t.marketId ?? '',
      campaignName: t.campaignName ?? '',
      utmCampaign: t.utmCampaign ?? '',
      metaSpend: t.metaSpend ? String(t.metaSpend) : '',
      googleSpend: t.googleSpend ? String(t.googleSpend) : '',
    });
    setEditingId(t.id);
  }

  function close() {
    setEditingId(null);
    setError(null);
  }

  async function submit() {
    // Client-side UTM slug check before we burn a request — server re-validates.
    if (form.utmCampaign && !UTM_CAMPAIGN_RE.test(form.utmCampaign.trim().toLowerCase())) {
      setError('UTM campaign must be lowercase letters/digits/underscore/hyphen, max 40 chars');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sharedFields = {
        label: form.label || undefined,
        campaignName: form.campaignName || undefined,
        utmCampaign: form.utmCampaign ? form.utmCampaign.trim().toLowerCase() : '',
        metaSpend: form.metaSpend === '' ? 0 : Number(form.metaSpend),
        googleSpend: form.googleSpend === '' ? 0 : Number(form.googleSpend),
      };
      const res = isEditing
        ? await fetch('/api/admin/growth/targets', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingId, ...sharedFields }),
          })
        : await fetch('/api/admin/growth/targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: form.type,
              count: Number(form.count),
              deadline: form.deadline,
              marketId: form.marketId || null,
              ...sharedFields,
            }),
          });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to save target');
        return;
      }
      close();
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
            Set a goal, log ad spend, see required pace + remaining budget.
          </p>
        </div>
        <button
          onClick={() => (editingId === null ? openCreate() : close())}
          className="px-3 py-1.5 text-xs font-medium bg-white text-black rounded-md hover:bg-neutral-200"
        >
          {editingId === null ? '+ New Target' : 'Cancel'}
        </button>
      </div>

      {editingId !== null && (
        <div className="mb-4 p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-3">
          {isEditing && (
            <p className="text-[11px] text-amber-400/80">
              Editing existing target — type, count, deadline, and market are locked. Update spend and campaign as the campaign runs.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Type</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as 'driver' | 'rider' })}
                disabled={isEditing}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
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
                disabled={isEditing}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
                placeholder="200"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Deadline</span>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                disabled={isEditing}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Market</span>
              <select
                value={form.marketId}
                onChange={(e) => setForm({ ...form, marketId: e.target.value })}
                disabled={isEditing}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
              >
                <option value="">All markets</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Campaign Name</span>
              <input
                type="text"
                value={form.campaignName}
                onChange={(e) => setForm({ ...form, campaignName: e.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
                placeholder='e.g. "Spring Push - Decatur"'
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Internal Label (optional)</span>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
                placeholder="optional note"
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">UTM Campaign Slug (attribution key)</span>
              <input
                type="text"
                value={form.utmCampaign}
                onChange={(e) => setForm({ ...form, utmCampaign: e.target.value.toLowerCase() })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm font-mono"
                placeholder="spring_push_decatur"
                maxLength={40}
              />
            </label>
            <p className="mt-1 text-[11px] text-neutral-500">
              Use this exact value as <code className="text-emerald-400">?utm_campaign=</code> on every ad URL. Leave blank to use blended CAC across all signups.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Meta Spend ($)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.metaSpend}
                onChange={(e) => setForm({ ...form, metaSpend: e.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
                placeholder="0 if not running Meta ads"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">Google Spend ($)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.googleSpend}
                onChange={(e) => setForm({ ...form, googleSpend: e.target.value })}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5 text-sm"
                placeholder="0 if not running Google ads"
              />
            </label>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={submit}
            disabled={busy || (!isEditing && (!form.count || !form.deadline))}
            className="px-4 py-1.5 text-xs font-medium bg-emerald-500 text-black rounded-md hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Saving…' : isEditing ? 'Update Target' : 'Save Target'}
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
          {targets.map((t) => (
            <TargetRow
              key={t.id}
              target={t}
              markets={markets}
              onRemove={() => remove(t.id)}
              onEdit={() => openEdit(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TargetRow({
  target: t,
  markets,
  onRemove,
  onEdit,
}: {
  target: DecoratedTarget;
  markets: MarketLite[];
  onRemove: () => void;
  onEdit: () => void;
}) {
  const marketName = t.marketId ? markets.find((m) => m.id === t.marketId)?.name ?? 'Market' : 'All markets';
  const accent = t.type === 'driver' ? '#a855f7' : '#22d3ee';
  const expectedPct = Math.min(100, Math.max(0, (t.expectedNow / t.count) * 100));
  const actualPct = Math.min(100, Math.max(0, t.pctComplete));
  const status = t.onTrack
    ? { tag: 'ON PACE', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' }
    : { tag: 'BEHIND', cls: 'bg-red-500/20 text-red-400 border-red-500/40' };

  const hasSpend = t.totalSpend > 0;

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold capitalize" style={{ color: accent }}>{t.type}s</span>
            <span className="text-sm text-neutral-300">→ {t.count.toLocaleString()}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.cls}`}>{status.tag}</span>
            {t.campaignName && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-300 bg-neutral-900">
                {t.campaignName}
              </span>
            )}
            {t.utmCampaign && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
                utm:{t.utmCampaign}
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            {marketName} · deadline {t.deadline} · {t.daysRemaining}d left
            {t.label ? ` · ${t.label}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={onEdit} className="text-xs text-neutral-400 hover:text-white">Edit</button>
          <button onClick={onRemove} className="text-xs text-neutral-500 hover:text-red-400">Delete</button>
        </div>
      </div>

      {/* Progress bar with expected-tick overlay */}
      <div className="relative h-3 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-700"
          style={{ width: `${actualPct}%`, background: accent, opacity: 0.85 }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-white/70"
          style={{ left: `calc(${expectedPct}% - 1px)` }}
          title={`Expected today: ${t.expectedNow}`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <Stat label="Actual" value={`${t.actual.toLocaleString()}`} sub={`${t.pctComplete}% of goal`} />
        <Stat
          label="Expected today"
          value={`${t.expectedNow.toLocaleString()}`}
          sub={t.onTrack ? `+${t.actual - t.expectedNow} ahead` : `${t.actual - t.expectedNow} behind`}
          subColor={t.onTrack ? 'text-emerald-400' : 'text-red-400'}
        />
        <Stat label="Need / day" value={t.requiredPerDayRemaining.toFixed(1)} sub={`for next ${t.daysRemaining}d`} />
        <Stat
          label="Projected at deadline"
          value={`${t.projectedAtDeadline.toLocaleString()}`}
          sub={t.projectedAtDeadline >= t.count ? 'will hit goal' : `short by ${(t.count - t.projectedAtDeadline).toLocaleString()}`}
          subColor={t.projectedAtDeadline >= t.count ? 'text-emerald-400' : 'text-amber-400'}
        />
      </div>

      <div className="mt-4 pt-3 border-t border-neutral-900">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">Ad Spend</span>
          {!hasSpend && (
            <span className="text-[10px] text-neutral-600">— none logged · click Edit to add</span>
          )}
          {t.utmCampaign && hasSpend && t.attributedTotal === 0 && (
            <span className="text-[10px] text-amber-400/80">
              — UTM tagged but no signups attributed yet
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Total spent"
            value={fmtMoney(t.totalSpend)}
            sub={`Meta ${fmtMoney(t.metaSpend)} · Google ${fmtMoney(t.googleSpend)}`}
          />
          <Stat
            label={t.utmCampaign ? 'Campaign CAC' : 'Blended CAC'}
            value={
              t.campaignCac !== null
                ? fmtMoney(t.campaignCac)
                : t.blendedCac !== null
                ? fmtMoney(t.blendedCac)
                : '—'
            }
            sub={
              t.campaignCac !== null
                ? `per attributed signup`
                : t.blendedCac !== null
                ? `per signup (no UTM filter)`
                : 'need spend + signups'
            }
          />
          <Stat
            label="Remaining signups"
            value={t.remainingSignups.toLocaleString()}
            sub={t.remainingSignups === 0 ? 'goal hit' : 'to hit goal'}
            subColor={t.remainingSignups === 0 ? 'text-emerald-400' : undefined}
          />
          <Stat
            label="Required spend to hit"
            value={t.requiredAdditionalSpend !== null ? fmtMoney(t.requiredAdditionalSpend) : '—'}
            sub={
              t.requiredAdditionalSpend === null
                ? 'set CAC first'
                : t.requiredAdditionalSpend === 0
                ? 'no more spend needed'
                : t.utmCampaign
                ? 'at current campaign CAC'
                : 'at current blended CAC'
            }
            subColor={t.requiredAdditionalSpend === 0 ? 'text-emerald-400' : 'text-amber-400'}
          />
        </div>
      </div>

      {t.utmCampaign && (
        <div className="mt-4 pt-3 border-t border-neutral-900">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">Per-Channel Attribution</span>
            <span className="text-[10px] text-neutral-600">
              · joined on <code className="text-emerald-400/80">utm_campaign={t.utmCampaign}</code>
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="Meta signups"
              value={t.attributedMeta.toLocaleString()}
              sub={
                t.metaCac !== null
                  ? `${fmtMoney(t.metaCac)} CAC`
                  : t.metaSpend > 0
                  ? 'spent, no signups yet'
                  : 'no Meta spend logged'
              }
              subColor={t.metaCac !== null ? 'text-emerald-400' : undefined}
            />
            <Stat
              label="Google signups"
              value={t.attributedGoogle.toLocaleString()}
              sub={
                t.googleCac !== null
                  ? `${fmtMoney(t.googleCac)} CAC`
                  : t.googleSpend > 0
                  ? 'spent, no signups yet'
                  : 'no Google spend logged'
              }
              subColor={t.googleCac !== null ? 'text-emerald-400' : undefined}
            />
            <Stat
              label="Other attributed"
              value={t.attributedOther.toLocaleString()}
              sub={t.attributedOther > 0 ? 'organic UTM tags' : '—'}
            />
            <Stat
              label="Untracked / Direct"
              value={t.untracked.toLocaleString()}
              sub={
                t.utmCampaign && t.untracked > 0
                  ? 'no campaign UTM'
                  : t.untracked === 0 && t.actual > 0
                  ? 'all signups attributed'
                  : '—'
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function fmtMoney(n: number): string {
  if (n === 0) return '$0';
  if (n < 1) return `$${n.toFixed(2)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
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
