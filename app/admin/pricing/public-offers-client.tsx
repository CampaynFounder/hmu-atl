'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface PublicOffer {
  id: string;
  marketId: string | null;
  marketSlug: string | null;
  tier: 'free' | 'hmu_first';
  funnelStageSlug: string | null;
  beforePriceCents: number;
  afterPriceCents: number;
  labelText: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
}

interface FunnelStage { slug: string; label: string }

const TIERS: Array<{ key: 'free' | 'hmu_first'; label: string }> = [
  { key: 'free', label: 'Free' },
  { key: 'hmu_first', label: 'HMU First' },
];

// Fallback — will be overwritten by fetched stages
const DEFAULT_STAGES: FunnelStage[] = [
  { slug: 'awareness', label: 'Awareness' },
  { slug: 'interest', label: 'Interest' },
  { slug: 'consideration', label: 'Consideration' },
  { slug: 'conversion', label: 'Conversion' },
  { slug: 'activation', label: 'Activation' },
];

function fmtCents(cents: number): string {
  if (cents === 0) return 'FREE';
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '').trim();
  if (cleaned === '' || cleaned.toLowerCase() === 'free') return 0;
  const asFloat = Number.parseFloat(cleaned);
  if (!Number.isFinite(asFloat) || asFloat < 0) return null;
  return Math.round(asFloat * 100);
}

export default function PublicOffersClient() {
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [stages, setStages] = useState<FunnelStage[]>(DEFAULT_STAGES);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [editorCell, setEditorCell] = useState<{ tier: 'free' | 'hmu_first'; stage: string | null } | null>(null);

  const loadOffers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/public-offers', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
      }
    } catch {
      // Network error — leave offers as-is
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/public-offers', { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : null)
        .then((d: { offers?: PublicOffer[] } | null) => {
          if (d?.offers) setOffers(d.offers);
        })
        .catch(() => {}),
      fetch('/api/admin/funnel/stages', { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : null)
        .then((d: { stages?: Array<{ slug: string; label: string }> } | null) => {
          if (d?.stages?.length) {
            setStages(d.stages.map((s) => ({ slug: s.slug, label: s.label })));
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Current active offer for each (tier, stage) cell. A stage-null row acts as
  // a fallback for any stage that doesn't have its own row.
  const offersByCell = useMemo(() => {
    const map = new Map<string, PublicOffer>();
    // Index stage-null rows first, then stage-specific rows (which override).
    for (const o of offers.filter((x) => x.funnelStageSlug === null)) {
      for (const s of stages) map.set(`${o.tier}:${s.slug}`, o);
    }
    for (const o of offers.filter((x) => x.funnelStageSlug !== null)) {
      map.set(`${o.tier}:${o.funnelStageSlug}`, o);
    }
    return map;
  }, [offers, stages]);

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-neutral-800 border border-neutral-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold">Public Offers</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Strike-through promo pricing shown on marketing tier cards. Configurable per tier × funnel stage. Display-only — never affects platform fees.
        </p>
      </div>

      {loading ? (
        <div className="p-6 text-neutral-500 text-sm">Loading offers…</div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-950">
              <tr>
                <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500">Tier</th>
                {stages.map((s) => (
                  <th key={s.slug} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier) => (
                <tr key={tier.key} className="border-t border-neutral-800">
                  <td className="px-3 py-3 font-medium text-white">{tier.label}</td>
                  {stages.map((stage) => {
                    const offer = offersByCell.get(`${tier.key}:${stage.slug}`) || null;
                    return (
                      <td key={stage.slug} className="px-3 py-3 align-top">
                        <button
                          onClick={() => setEditorCell({ tier: tier.key, stage: stage.slug })}
                          className="text-left w-full rounded-lg border border-neutral-800 bg-neutral-950 hover:border-blue-500/50 px-3 py-2 transition-colors"
                        >
                          {offer ? (
                            <div>
                              <div className="text-xs text-neutral-500 line-through">{fmtCents(offer.beforePriceCents)}</div>
                              <div className="text-base font-bold text-emerald-400">{fmtCents(offer.afterPriceCents)}</div>
                              {offer.labelText && (
                                <div className="text-[10px] text-orange-400 mt-0.5">{offer.labelText}</div>
                              )}
                              <div className={`text-[10px] mt-1 ${offer.isActive ? 'text-emerald-500' : 'text-neutral-600'}`}>
                                {offer.isActive ? 'ACTIVE' : 'inactive'}
                                {offer.funnelStageSlug === null && ' · all stages'}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-neutral-600 italic">+ Add offer</div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage-null offers (applied to all stages if no stage-specific row) */}
      {offers.some((o) => o.funnelStageSlug === null) && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">All-stages fallback offers</div>
          <div className="space-y-1 text-xs">
            {offers.filter((o) => o.funnelStageSlug === null).map((o) => (
              <div key={o.id} className="flex items-center justify-between py-1">
                <span>
                  <span className="font-medium">{TIERS.find((t) => t.key === o.tier)?.label}</span>
                  {': '}
                  <span className="text-neutral-500 line-through">{fmtCents(o.beforePriceCents)}</span>
                  {' → '}
                  <span className="text-emerald-400">{fmtCents(o.afterPriceCents)}</span>
                  {o.labelText && <span className="text-orange-400 ml-2">{o.labelText}</span>}
                </span>
                <button
                  onClick={() => setEditorCell({ tier: o.tier, stage: null })}
                  className="text-blue-400 hover:underline text-[11px]"
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <button
          onClick={() => setEditorCell({ tier: 'hmu_first', stage: null })}
          className="text-xs text-blue-400 hover:underline"
        >
          + Add all-stages fallback offer
        </button>
      </div>

      {editorCell && (
        <OfferEditor
          tier={editorCell.tier}
          stageSlug={editorCell.stage}
          offer={offers.find((o) =>
            o.tier === editorCell.tier && o.funnelStageSlug === editorCell.stage,
          ) ?? null}
          stages={stages}
          onClose={() => setEditorCell(null)}
          onSaved={async (msg) => {
            setToast(msg);
            setTimeout(() => setToast(null), 3000);
            await loadOffers();
            setEditorCell(null);
          }}
        />
      )}
    </div>
  );
}

function OfferEditor(props: {
  tier: 'free' | 'hmu_first';
  stageSlug: string | null;
  offer: PublicOffer | null;
  stages: FunnelStage[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { tier, stageSlug, offer, stages, onClose, onSaved } = props;

  const [beforeStr, setBeforeStr] = useState(offer ? fmtCents(offer.beforePriceCents) : '');
  const [afterStr, setAfterStr] = useState(offer ? fmtCents(offer.afterPriceCents) : '');
  const [label, setLabel] = useState(offer?.labelText ?? '');
  const [isActive, setIsActive] = useState(offer?.isActive ?? false);
  const [effectiveTo, setEffectiveTo] = useState(offer?.effectiveTo?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageLabel = stageSlug
    ? stages.find((s) => s.slug === stageSlug)?.label ?? stageSlug
    : 'All stages (fallback)';

  async function save() {
    setError(null);
    const beforeCents = parsePriceToCents(beforeStr);
    const afterCents = parsePriceToCents(afterStr);
    if (beforeCents === null) { setError('Before price is not a valid amount'); return; }
    if (afterCents === null) { setError('After price is not a valid amount'); return; }

    setSaving(true);
    try {
      if (offer) {
        const res = await fetch(`/api/admin/public-offers/${offer.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            beforePriceCents: beforeCents,
            afterPriceCents: afterCents,
            labelText: label.trim() || null,
            isActive,
            effectiveTo: effectiveTo || null,
          }),
        });
        if (!res.ok) { setError((await res.json()).error || 'Save failed'); setSaving(false); return; }
        onSaved('Offer updated');
      } else {
        const res = await fetch('/api/admin/public-offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier,
            funnelStageSlug: stageSlug,
            beforePriceCents: beforeCents,
            afterPriceCents: afterCents,
            labelText: label.trim() || null,
            isActive,
            effectiveTo: effectiveTo || null,
          }),
        });
        if (!res.ok) { setError((await res.json()).error || 'Save failed'); setSaving(false); return; }
        onSaved('Offer created');
      }
    } catch { setError('Network error'); }
    setSaving(false);
  }

  async function deactivate() {
    if (!offer) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/public-offers/${offer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      if (!res.ok) { setError((await res.json()).error || 'Failed'); setSaving(false); return; }
      onSaved('Offer deactivated');
    } catch { setError('Network error'); }
    setSaving(false);
  }

  async function remove() {
    if (!offer) return;
    if (!confirm('Delete this offer? This cannot be undone.')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/public-offers/${offer.id}`, { method: 'DELETE' });
      if (!res.ok) { setError('Failed to delete'); setSaving(false); return; }
      onSaved('Offer deleted');
    } catch { setError('Network error'); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-neutral-500">
              {tier === 'free' ? 'Free tier' : 'HMU First tier'}
            </div>
            <div className="text-lg font-bold">{stageLabel}</div>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white">✕</button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-neutral-500 block mb-1">Before (strike-through)</label>
              <input
                value={beforeStr}
                onChange={(e) => setBeforeStr(e.target.value)}
                placeholder="$19.99"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-1">After (shown price)</label>
              <input
                value={afterStr}
                onChange={(e) => setAfterStr(e.target.value)}
                placeholder="$9.99"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Label (optional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Limited Time · First 50 Drivers"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Expires (optional)</label>
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none [color-scheme:dark]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active (show on marketing page)</span>
          </label>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : offer ? 'Save changes' : 'Create offer'}
            </button>
            {offer && offer.isActive && (
              <button
                onClick={deactivate}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-400 text-sm font-medium"
              >
                Deactivate
              </button>
            )}
            {offer && (
              <button
                onClick={remove}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-red-500/30 text-red-400 text-sm font-medium"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
