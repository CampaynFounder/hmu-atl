'use client';

import { useEffect, useState } from 'react';
import { useMarket } from '../components/market-context';

interface PricingConfig {
  id: string;
  tier: string;
  feeRate: number;
  dailyCap: number;
  weeklyCap: number;
  progressiveThresholds: { below?: number; above?: number; rate: number }[] | null;
  peakMultiplier: number;
  peakLabel: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string | null;
  isActive: boolean;
  createdAt: string;
}

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: 'Free Tier', color: '#888' },
  hmu_first: { label: 'HMU First ($9.99/mo)', color: '#448AFF' },
};

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export default function PricingConfigClient() {
  const [configs, setConfigs] = useState<PricingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Edit form state
  const [formRate, setFormRate] = useState('');
  const [formDailyCap, setFormDailyCap] = useState('');
  const [formWeeklyCap, setFormWeeklyCap] = useState('');
  const [formPeakMultiplier, setFormPeakMultiplier] = useState('1');
  const [formPeakLabel, setFormPeakLabel] = useState('');
  const [formEffectiveFrom, setFormEffectiveFrom] = useState('');
  const [formEffectiveTo, setFormEffectiveTo] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formThresholds, setFormThresholds] = useState<{ below?: number; above?: number; rate: number }[]>([]);

  // Preview calculator
  const [previewAmount, setPreviewAmount] = useState('25');
  const [previewTier, setPreviewTier] = useState('free');

  const { selectedMarketId } = useMarket();

  useEffect(() => {
    const url = selectedMarketId
      ? `/api/admin/pricing?marketId=${selectedMarketId}`
      : '/api/admin/pricing';
    setLoading(true);
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.configs) setConfigs(data.configs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedMarketId]);

  const activeConfigs = configs.filter(c => c.isActive);
  const history = configs.filter(c => !c.isActive);

  function startEdit(config: PricingConfig) {
    setEditingTier(config.tier);
    setFormRate(String(config.feeRate * 100));
    setFormDailyCap(String(config.dailyCap));
    setFormWeeklyCap(String(config.weeklyCap));
    setFormPeakMultiplier(String(config.peakMultiplier));
    setFormPeakLabel(config.peakLabel || '');
    setFormEffectiveFrom(new Date().toISOString().split('T')[0]);
    setFormEffectiveTo('');
    setFormReason('');
    setFormThresholds(config.progressiveThresholds || []);
  }

  async function saveConfig() {
    if (!editingTier) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: editingTier,
          marketId: selectedMarketId,
          feeRate: parseFloat(formRate) / 100,
          dailyCap: parseFloat(formDailyCap),
          weeklyCap: parseFloat(formWeeklyCap),
          progressiveThresholds: formThresholds.length > 0 ? formThresholds : undefined,
          peakMultiplier: parseFloat(formPeakMultiplier) || 1,
          peakLabel: formPeakLabel || undefined,
          effectiveFrom: formEffectiveFrom || undefined,
          effectiveTo: formEffectiveTo || undefined,
          changeReason: formReason || undefined,
        }),
      });
      if (res.ok) {
        setToast('Pricing updated');
        setEditingTier(null);
        // Refetch
        const refetchUrl = selectedMarketId
          ? `/api/admin/pricing?marketId=${selectedMarketId}`
          : '/api/admin/pricing';
        const r = await fetch(refetchUrl);
        if (r.ok) { const d = await r.json(); setConfigs(d.configs); }
      } else {
        const data = await res.json();
        setToast(data.error || 'Failed to save');
      }
    } catch { setToast('Network error'); }
    setSaving(false);
    setTimeout(() => setToast(null), 3000);
  }

  // Preview calculation
  const previewConfig = activeConfigs.find(c => c.tier === previewTier);
  function calcPreview() {
    const amt = parseFloat(previewAmount) || 0;
    if (!previewConfig || amt <= 0) return null;
    const stripeFee = Math.round((amt * 0.029 + 0.30) * 100) / 100;
    const net = amt - stripeFee;
    let rate = previewConfig.feeRate;
    if (previewConfig.progressiveThresholds?.length) {
      // Use first tier rate as default for preview (no cumulative earnings context)
      rate = previewConfig.progressiveThresholds[0].rate;
    }
    const effectiveRate = rate * previewConfig.peakMultiplier;
    const platformFee = Math.round(net * effectiveRate * 100) / 100;
    const driverGets = Math.round((net - platformFee) * 100) / 100;
    const profit = Math.round((platformFee - stripeFee) * 100) / 100;
    return { stripeFee, platformFee, driverGets, profit, effectiveRate };
  }
  const preview = calcPreview();

  if (loading) return <div className="p-6 text-neutral-500 text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-neutral-800 border border-neutral-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold">Pricing Configuration</h1>
        <p className="text-xs text-neutral-500 mt-1">View and modify fee rates, caps, and peak pricing. Changes take effect on next ride capture.</p>
      </div>

      {/* Active Configs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {activeConfigs.map(config => {
          const ti = TIER_LABELS[config.tier] || { label: config.tier, color: 'var(--admin-text)' };
          const isEditing = editingTier === config.tier;
          return (
            <div key={config.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ti.color }} />
                  <span className="text-sm font-semibold">{ti.label}</span>
                </div>
                {!isEditing && (
                  <button onClick={() => startEdit(config)} className="text-xs text-blue-400 hover:underline">
                    Edit
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-1">Base Fee Rate (%)</label>
                      <input type="number" step="0.1" value={formRate} onChange={e => setFormRate(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-1">Peak Multiplier</label>
                      <input type="number" step="0.1" value={formPeakMultiplier} onChange={e => setFormPeakMultiplier(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-1">Daily Cap ($)</label>
                      <input type="number" value={formDailyCap} onChange={e => setFormDailyCap(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-1">Weekly Cap ($)</label>
                      <input type="number" value={formWeeklyCap} onChange={e => setFormWeeklyCap(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none" />
                    </div>
                  </div>

                  {formPeakMultiplier !== '1' && (
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-1">Peak Label (shown to users)</label>
                      <input type="text" value={formPeakLabel} onChange={e => setFormPeakLabel(e.target.value)}
                        placeholder="e.g. Weekend surge, Holiday peak"
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                    </div>
                  )}

                  {/* Progressive thresholds (free tier) */}
                  {editingTier === 'free' && formThresholds.length > 0 && (
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-1">Progressive Thresholds</label>
                      <div className="space-y-2">
                        {formThresholds.map((t, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-neutral-500 w-20">
                              {t.below ? `< $${t.below}` : `> $${t.above}`}
                            </span>
                            <input type="number" step="0.1"
                              value={t.rate * 100}
                              onChange={e => {
                                const updated = [...formThresholds];
                                updated[i] = { ...t, rate: parseFloat(e.target.value) / 100 };
                                setFormThresholds(updated);
                              }}
                              className="w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-white font-mono outline-none"
                            />
                            <span className="text-neutral-600">%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-1">Effective From</label>
                      <input type="date" value={formEffectiveFrom} onChange={e => setFormEffectiveFrom(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-500 block mb-1">Effective To (optional)</label>
                      <input type="date" value={formEffectiveTo} onChange={e => setFormEffectiveTo(e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none [color-scheme:dark]" />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-neutral-500 block mb-1">Reason for change</label>
                    <input type="text" value={formReason} onChange={e => setFormReason(e.target.value)}
                      placeholder="e.g. Peak weekend pricing, seasonal adjustment"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button onClick={saveConfig} disabled={saving}
                      className="flex-1 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save & Activate'}
                    </button>
                    <button onClick={() => setEditingTier(null)}
                      className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-400 text-sm font-medium">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Display mode */
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-neutral-500">Base Rate</p>
                      <p className="text-lg font-bold font-mono">{pct(config.feeRate)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-500">Peak Multiplier</p>
                      <p className={`text-lg font-bold font-mono ${config.peakMultiplier > 1 ? 'text-orange-400' : ''}`}>
                        {config.peakMultiplier}x
                        {config.peakLabel && <span className="text-[10px] text-orange-400 ml-1">{config.peakLabel}</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-500">Daily Cap</p>
                      <p className="text-lg font-bold font-mono">{fmt(config.dailyCap)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-500">Weekly Cap</p>
                      <p className="text-lg font-bold font-mono">{fmt(config.weeklyCap)}</p>
                    </div>
                  </div>

                  {config.progressiveThresholds && (
                    <div className="pt-2 border-t border-neutral-800">
                      <p className="text-[10px] text-neutral-500 mb-1">Progressive Rates</p>
                      <div className="space-y-1">
                        {config.progressiveThresholds.map((t, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-neutral-400">
                              {t.below ? `Under $${t.below}/day` : `Over $${t.above}/day`}
                            </span>
                            <span className="text-white font-mono">{pct(t.rate)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-neutral-800 text-[10px] text-neutral-600">
                    Effective: {new Date(config.effectiveFrom).toLocaleDateString()}
                    {config.effectiveTo && ` → ${new Date(config.effectiveTo).toLocaleDateString()}`}
                    {config.changeReason && ` · ${config.changeReason}`}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Preview Calculator */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-3">Fee Preview Calculator</h2>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Ride Amount</label>
            <div className="flex items-center gap-1">
              <span className="text-emerald-400 font-bold">$</span>
              <input type="number" value={previewAmount} onChange={e => setPreviewAmount(e.target.value)}
                className="w-24 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Tier</label>
            <select value={previewTier} onChange={e => setPreviewTier(e.target.value)}
              className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none">
              <option value="free">Free</option>
              <option value="hmu_first">HMU First</option>
            </select>
          </div>
        </div>
        {preview && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <p className="text-[10px] text-neutral-500">Stripe Fee</p>
              <p className="text-sm font-bold font-mono text-red-400">-{fmt(preview.stripeFee)}</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-500">Platform Fee ({pct(preview.effectiveRate)})</p>
              <p className="text-sm font-bold font-mono text-emerald-400">{fmt(preview.platformFee)}</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-500">Driver Gets</p>
              <p className="text-sm font-bold font-mono text-blue-400">{fmt(preview.driverGets)}</p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-500">Profit</p>
              <p className={`text-sm font-bold font-mono ${preview.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(preview.profit)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-neutral-500">Effective Rate</p>
              <p className="text-sm font-bold font-mono">{pct(preview.effectiveRate)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Change History */}
      {history.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">Change History</h2>
          <div className="space-y-2">
            {history.map(config => {
              const ti = TIER_LABELS[config.tier] || { label: config.tier, color: 'var(--admin-text)' };
              return (
                <div key={config.id} className="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ti.color }} />
                    <span className="text-neutral-400">{ti.label}</span>
                    <span className="text-white font-mono">{pct(config.feeRate)}</span>
                    {config.peakMultiplier > 1 && (
                      <span className="text-orange-400">{config.peakMultiplier}x</span>
                    )}
                    <span className="text-neutral-600">Cap: {fmt(config.dailyCap)}/{fmt(config.weeklyCap)}</span>
                  </div>
                  <div className="text-right flex-shrink-0 text-neutral-600">
                    <div>{new Date(config.effectiveFrom).toLocaleDateString()}</div>
                    {config.changeReason && <div className="text-[10px] truncate max-w-32">{config.changeReason}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
