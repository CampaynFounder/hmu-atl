'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ──

interface NoShowTier {
  up_to?: number;
  above?: number;
  rate: number;
}

interface HoldPolicyData {
  id: string;
  tier: string;
  holdMode: string;
  holdPercent: number | null;
  holdFixed: number | null;
  holdMinimum: number;
  cancelBeforeOtwRefundPct: number;
  cancelAfterOtwDriverPct: number;
  cancelAfterOtwPlatformPct: number;
  noShowPlatformTiers: NoShowTier[];
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── Helpers ──

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Progressive marginal no-show calculation — each dollar slice gets its own rate */
function calcNoShowSplit(ridePrice: number, tiers: NoShowTier[]) {
  if (!tiers.length) return { platformTotal: 0, driverGets: ridePrice, effectiveRate: 0, breakdown: [] as { slice: string; amount: number; rate: number; cut: number }[] };
  let platformTotal = 0;
  let remaining = ridePrice;
  let prevCeiling = 0;
  const breakdown: { slice: string; amount: number; rate: number; cut: number }[] = [];
  const sorted = [...tiers].sort((a, b) => {
    if (a.above != null) return 1;
    if (b.above != null) return -1;
    return (a.up_to ?? 0) - (b.up_to ?? 0);
  });
  for (const tier of sorted) {
    if (remaining <= 0) break;
    let sliceAmount: number;
    let sliceLabel: string;
    if (tier.up_to != null) {
      sliceAmount = Math.min(remaining, tier.up_to - prevCeiling);
      sliceLabel = prevCeiling === 0 ? `First $${tier.up_to}` : `$${prevCeiling} – $${tier.up_to}`;
      prevCeiling = tier.up_to;
    } else {
      sliceAmount = remaining;
      sliceLabel = `Over $${tier.above ?? prevCeiling}`;
    }
    if (sliceAmount <= 0) continue;
    const cut = Math.round(sliceAmount * tier.rate * 100) / 100;
    platformTotal += cut;
    remaining -= sliceAmount;
    breakdown.push({ slice: sliceLabel, amount: Math.round(sliceAmount * 100) / 100, rate: tier.rate, cut });
  }
  platformTotal = Math.round(platformTotal * 100) / 100;
  return { platformTotal, driverGets: Math.round((ridePrice - platformTotal) * 100) / 100, effectiveRate: ridePrice > 0 ? platformTotal / ridePrice : 0, breakdown };
}

const TIER_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: 'Free Tier', color: '#888' },
  hmu_first: { label: 'HMU First ($9.99/mo)', color: '#448AFF' },
};

const HOLD_MODE_LABELS: Record<string, string> = {
  full: 'Full Ride Amount',
  deposit_percent: 'Deposit — % of Ride',
  deposit_fixed: 'Deposit — Fixed Amount',
};

// ── Explanation components ──

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-[11px] text-neutral-400 leading-relaxed">
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

// ── Main Component ──

export default function HoldPolicyClient() {
  const [policies, setPolicies] = useState<HoldPolicyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Form state
  const [formHoldMode, setFormHoldMode] = useState('deposit_percent');
  const [formHoldPercent, setFormHoldPercent] = useState('25');
  const [formHoldFixed, setFormHoldFixed] = useState('5');
  const [formHoldMinimum, setFormHoldMinimum] = useState('5');
  const [formCancelBeforeOtwRefund, setFormCancelBeforeOtwRefund] = useState('100');
  const [formCancelAfterOtwDriver, setFormCancelAfterOtwDriver] = useState('100');
  const [formCancelAfterOtwPlatform, setFormCancelAfterOtwPlatform] = useState('0');
  const [formNoShowTiers, setFormNoShowTiers] = useState<NoShowTier[]>([]);
  const [formEffectiveFrom, setFormEffectiveFrom] = useState('');
  const [formEffectiveTo, setFormEffectiveTo] = useState('');
  const [formReason, setFormReason] = useState('');

  // Preview state
  const [previewRidePrice, setPreviewRidePrice] = useState('30');
  const [previewTier, setPreviewTier] = useState('free');

  const fetchPolicies = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/hold-policy');
      if (r.ok) {
        const d = await r.json();
        setPolicies(d.policies);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const activePolicies = policies.filter(p => p.isActive);
  const history = policies.filter(p => !p.isActive);

  function startEdit(policy: HoldPolicyData) {
    setEditingTier(policy.tier);
    setFormHoldMode(policy.holdMode);
    setFormHoldPercent(String((policy.holdPercent ?? 0.25) * 100));
    setFormHoldFixed(String(policy.holdFixed ?? 5));
    setFormHoldMinimum(String(policy.holdMinimum));
    setFormCancelBeforeOtwRefund(String(policy.cancelBeforeOtwRefundPct * 100));
    setFormCancelAfterOtwDriver(String(policy.cancelAfterOtwDriverPct * 100));
    setFormCancelAfterOtwPlatform(String(policy.cancelAfterOtwPlatformPct * 100));
    setFormNoShowTiers(policy.noShowPlatformTiers?.length ? [...policy.noShowPlatformTiers] : [
      { up_to: 15, rate: 0.05 },
      { up_to: 30, rate: 0.10 },
      { up_to: 60, rate: 0.15 },
      { above: 60, rate: 0.20 },
    ]);
    setFormEffectiveFrom(new Date().toISOString().split('T')[0]);
    setFormEffectiveTo('');
    setFormReason('');
  }

  async function savePolicy() {
    if (!editingTier) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/hold-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: editingTier,
          holdMode: formHoldMode,
          holdPercent: formHoldMode === 'deposit_percent' ? parseFloat(formHoldPercent) / 100 : null,
          holdFixed: formHoldMode === 'deposit_fixed' ? parseFloat(formHoldFixed) : null,
          holdMinimum: parseFloat(formHoldMinimum) || 5,
          cancelBeforeOtwRefundPct: parseFloat(formCancelBeforeOtwRefund) / 100,
          cancelAfterOtwDriverPct: parseFloat(formCancelAfterOtwDriver) / 100,
          cancelAfterOtwPlatformPct: parseFloat(formCancelAfterOtwPlatform) / 100,
          noShowPlatformTiers: formNoShowTiers,
          effectiveFrom: formEffectiveFrom || undefined,
          effectiveTo: formEffectiveTo || undefined,
          changeReason: formReason || undefined,
        }),
      });
      if (res.ok) {
        setToast('Hold policy updated');
        setEditingTier(null);
        await fetchPolicies();
      } else {
        const data = await res.json();
        setToast(data.error || 'Failed to save');
      }
    } catch { setToast('Network error'); }
    setSaving(false);
    setTimeout(() => setToast(null), 3000);
  }

  // ── Preview calculations ──

  const previewPolicy = activePolicies.find(p => p.tier === previewTier);
  const previewPrice = parseFloat(previewRidePrice) || 0;

  function calcDeposit() {
    if (!previewPolicy || previewPrice <= 0) return null;
    let deposit: number;
    switch (previewPolicy.holdMode) {
      case 'deposit_percent':
        deposit = previewPrice * (previewPolicy.holdPercent ?? 0.25);
        deposit = Math.max(deposit, previewPolicy.holdMinimum);
        deposit = Math.min(deposit, previewPrice);
        break;
      case 'deposit_fixed':
        deposit = Math.min(previewPolicy.holdFixed ?? 5, previewPrice);
        break;
      default:
        deposit = previewPrice;
    }
    return Math.round(deposit * 100) / 100;
  }

  const depositPreview = calcDeposit();
  const noShowPreview = previewPolicy ? calcNoShowSplit(previewPrice, previewPolicy.noShowPlatformTiers) : null;

  if (loading) return <div className="p-6 text-neutral-500 text-sm">Loading hold policies...</div>;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-neutral-800 border border-neutral-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Section Title ── */}
      <div>
        <h1 className="text-xl font-bold">Hold & Cancellation Policy</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Configure how much riders are charged upfront, what happens on cancellations, and how no-show fees are split.
          Changes take effect on the next ride.
        </p>
      </div>

      {/* ── Active Policies ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {activePolicies.map(policy => {
          const ti = TIER_LABELS[policy.tier] || { label: policy.tier, color: 'var(--admin-text)' };
          const isEditing = editingTier === policy.tier;

          return (
            <div key={policy.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: ti.color }} />
                  <span className="text-sm font-semibold">{ti.label}</span>
                </div>
                {!isEditing && (
                  <button onClick={() => startEdit(policy)} className="text-xs text-blue-400 hover:underline">Edit</button>
                )}
              </div>

              {isEditing ? (
                <EditForm
                  formHoldMode={formHoldMode} setFormHoldMode={setFormHoldMode}
                  formHoldPercent={formHoldPercent} setFormHoldPercent={setFormHoldPercent}
                  formHoldFixed={formHoldFixed} setFormHoldFixed={setFormHoldFixed}
                  formHoldMinimum={formHoldMinimum} setFormHoldMinimum={setFormHoldMinimum}
                  formCancelBeforeOtwRefund={formCancelBeforeOtwRefund} setFormCancelBeforeOtwRefund={setFormCancelBeforeOtwRefund}
                  formCancelAfterOtwDriver={formCancelAfterOtwDriver} setFormCancelAfterOtwDriver={setFormCancelAfterOtwDriver}
                  formCancelAfterOtwPlatform={formCancelAfterOtwPlatform} setFormCancelAfterOtwPlatform={setFormCancelAfterOtwPlatform}
                  formNoShowTiers={formNoShowTiers} setFormNoShowTiers={setFormNoShowTiers}
                  formEffectiveFrom={formEffectiveFrom} setFormEffectiveFrom={setFormEffectiveFrom}
                  formEffectiveTo={formEffectiveTo} setFormEffectiveTo={setFormEffectiveTo}
                  formReason={formReason} setFormReason={setFormReason}
                  saving={saving} onSave={savePolicy} onCancel={() => setEditingTier(null)}
                />
              ) : (
                <DisplayMode policy={policy} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Live Preview Calculator ── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Scenario Preview</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">See exactly what happens at each stage for a given ride price.</p>
        </div>

        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Ride Price</label>
            <div className="flex items-center gap-1">
              <span className="text-emerald-400 font-bold">$</span>
              <input type="number" value={previewRidePrice} onChange={e => setPreviewRidePrice(e.target.value)}
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

        {previewPolicy && previewPrice > 0 && depositPreview != null && noShowPreview && (
          <div className="space-y-4">
            {/* Deposit preview */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">At booking (COO)</p>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-[10px] text-neutral-500">Rider sees held</p>
                  <p className="text-lg font-bold font-mono text-amber-400">{fmt(depositPreview)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Stripe authorizes</p>
                  <p className="text-lg font-bold font-mono text-neutral-400">{fmt(previewPrice)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Mode</p>
                  <p className="text-sm font-medium text-neutral-300">{HOLD_MODE_LABELS[previewPolicy.holdMode]}</p>
                </div>
              </div>
              <p className="text-[10px] text-neutral-600 mt-2">
                Stripe silently authorizes the full {fmt(previewPrice)} so we can capture on completion. The rider only sees {fmt(depositPreview)} as their commitment.
              </p>
            </div>

            {/* Ride completes */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Ride completes normally</p>
              <p className="text-sm text-neutral-300">Full {fmt(previewPrice)} is captured. Platform fee calculated per pricing config (not hold policy).</p>
            </div>

            {/* Cancel before OTW */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Rider cancels before driver is OTW</p>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-[10px] text-neutral-500">Rider refunded</p>
                  <p className="font-bold font-mono text-emerald-400">{fmt(depositPreview * previewPolicy.cancelBeforeOtwRefundPct)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Driver gets</p>
                  <p className="font-bold font-mono text-blue-400">{fmt(depositPreview * (1 - previewPolicy.cancelBeforeOtwRefundPct))}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Platform gets</p>
                  <p className="font-bold font-mono text-neutral-500">{fmt(0)}</p>
                </div>
              </div>
            </div>

            {/* Cancel after OTW */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Rider cancels after driver is OTW</p>
              <div className="flex gap-6 text-sm">
                <div>
                  <p className="text-[10px] text-neutral-500">Driver gets</p>
                  <p className="font-bold font-mono text-blue-400">{fmt(depositPreview * previewPolicy.cancelAfterOtwDriverPct)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Platform gets</p>
                  <p className="font-bold font-mono text-emerald-400">{fmt(depositPreview * previewPolicy.cancelAfterOtwPlatformPct)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Rider refunded</p>
                  <p className="font-bold font-mono text-neutral-400">
                    {fmt(Math.max(0, depositPreview - (depositPreview * previewPolicy.cancelAfterOtwDriverPct) - (depositPreview * previewPolicy.cancelAfterOtwPlatformPct)))}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-neutral-600 mt-2">
                Capped at the deposit ({fmt(depositPreview)}). Driver burned gas getting there — they keep their share. Remaining hold is released.
              </p>
            </div>

            {/* No-show */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-2">Rider no-show (full ride charged)</p>
              <div className="flex gap-6 text-sm mb-3">
                <div>
                  <p className="text-[10px] text-neutral-500">Rider charged</p>
                  <p className="font-bold font-mono text-red-400">{fmt(previewPrice)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Driver gets</p>
                  <p className="font-bold font-mono text-blue-400">{fmt(noShowPreview.driverGets)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Platform gets</p>
                  <p className="font-bold font-mono text-emerald-400">{fmt(noShowPreview.platformTotal)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500">Effective rate</p>
                  <p className="font-bold font-mono">{pct(noShowPreview.effectiveRate)}</p>
                </div>
              </div>
              {noShowPreview.breakdown.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] text-neutral-600">Progressive tier breakdown:</p>
                  {noShowPreview.breakdown.map((b, i) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span className="text-neutral-500">{b.slice} ({fmt(b.amount)} at {pct(b.rate)})</span>
                      <span className="text-emerald-400 font-mono">{fmt(b.cut)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-neutral-600 mt-2">
                No-shows charge the full ride amount — not just the deposit. Platform takes a progressive cut: less on small rides, more on big ones.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Change History ── */}
      {history.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">Policy History</h2>
          <div className="space-y-2">
            {history.map(policy => {
              const ti = TIER_LABELS[policy.tier] || { label: policy.tier, color: 'var(--admin-text)' };
              return (
                <div key={policy.id} className="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ti.color }} />
                    <span className="text-neutral-400">{ti.label}</span>
                    <span className="text-white font-mono">{HOLD_MODE_LABELS[policy.holdMode]}</span>
                    {policy.holdMode === 'deposit_percent' && <span className="text-amber-400">{pct(policy.holdPercent ?? 0)}</span>}
                    {policy.holdMode === 'deposit_fixed' && <span className="text-amber-400">{fmt(policy.holdFixed ?? 0)}</span>}
                  </div>
                  <div className="text-right flex-shrink-0 text-neutral-600">
                    <div>{new Date(policy.effectiveFrom).toLocaleDateString()}</div>
                    {policy.changeReason && <div className="text-[10px] truncate max-w-40">{policy.changeReason}</div>}
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

// ── Display Mode (read-only) ──

function DisplayMode({ policy }: { policy: HoldPolicyData }) {
  return (
    <div className="space-y-4">
      {/* Hold Strategy */}
      <div>
        <SectionHeader
          title="Hold Strategy"
          subtitle="How much is held on the rider's card when they tap COO."
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-neutral-500">Mode</p>
            <p className="text-sm font-semibold">{HOLD_MODE_LABELS[policy.holdMode]}</p>
          </div>
          {policy.holdMode === 'deposit_percent' && (
            <>
              <div>
                <p className="text-[10px] text-neutral-500">Deposit %</p>
                <p className="text-lg font-bold font-mono text-amber-400">{pct(policy.holdPercent ?? 0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-500">Minimum Floor</p>
                <p className="text-sm font-bold font-mono">{fmt(policy.holdMinimum)}</p>
              </div>
            </>
          )}
          {policy.holdMode === 'deposit_fixed' && (
            <div>
              <p className="text-[10px] text-neutral-500">Fixed Deposit</p>
              <p className="text-lg font-bold font-mono text-amber-400">{fmt(policy.holdFixed ?? 0)}</p>
            </div>
          )}
        </div>
        <InfoBox>
          {policy.holdMode === 'full'
            ? 'The full ride amount is shown to the rider as held. Stripe authorizes the full amount.'
            : policy.holdMode === 'deposit_percent'
            ? `Rider sees ${pct(policy.holdPercent ?? 0)} of the ride price held (minimum ${fmt(policy.holdMinimum)}). Stripe silently authorizes the full ride amount so the full charge can be captured on completion.`
            : `Rider sees a flat ${fmt(policy.holdFixed ?? 0)} held. Stripe silently authorizes the full ride amount so the full charge can be captured on completion.`
          }
        </InfoBox>
      </div>

      {/* Voluntary Cancel */}
      <div className="pt-3 border-t border-neutral-800">
        <SectionHeader
          title="Voluntary Cancellation"
          subtitle="What happens when a rider cancels before the ride starts. Charges are capped at the deposit."
        />
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-neutral-500">Before OTW</p>
            <p className="text-sm">Rider refunded <span className="font-bold text-emerald-400">{pct(policy.cancelBeforeOtwRefundPct)}</span></p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-500">After OTW — Driver</p>
            <p className="text-sm">Gets <span className="font-bold text-blue-400">{pct(policy.cancelAfterOtwDriverPct)}</span></p>
          </div>
          <div>
            <p className="text-[10px] text-neutral-500">After OTW — Platform</p>
            <p className="text-sm">Gets <span className="font-bold text-emerald-400">{pct(policy.cancelAfterOtwPlatformPct)}</span></p>
          </div>
        </div>
        <InfoBox>
          Cancellations can only charge up to the visible deposit amount — never the full ride price.
          Before the driver starts driving (OTW), the rider gets {pct(policy.cancelBeforeOtwRefundPct)} back.
          After OTW, the driver already burned gas — they get {pct(policy.cancelAfterOtwDriverPct)} of the deposit.
        </InfoBox>
      </div>

      {/* No-Show */}
      <div className="pt-3 border-t border-neutral-800">
        <SectionHeader
          title="No-Show Charges"
          subtitle="When a rider doesn't show up after the driver arrives (HERE). The FULL ride amount is charged."
        />
        {policy.noShowPlatformTiers?.length > 0 ? (
          <div className="space-y-1">
            <p className="text-[10px] text-neutral-500 mb-1">Platform takes (progressive — each dollar slice at its own rate):</p>
            {policy.noShowPlatformTiers.map((t, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-neutral-400">
                  {t.up_to ? (i === 0 ? `First $${t.up_to}` : `$${policy.noShowPlatformTiers[i - 1]?.up_to ?? 0} – $${t.up_to}`) : `Over $${t.above}`}
                </span>
                <span className="text-emerald-400 font-mono">{pct(t.rate)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-400">No progressive tiers — driver keeps 100% of no-show charge.</p>
        )}
        <InfoBox>
          No-shows charge the full ride amount, not just the deposit. The platform takes a small progressive cut — less on cheaper rides, more on expensive ones. The driver keeps the rest. This is fair: the driver showed up and waited.
        </InfoBox>
      </div>

      {/* Effective date */}
      <div className="pt-2 border-t border-neutral-800 text-[10px] text-neutral-600">
        Effective: {new Date(policy.effectiveFrom).toLocaleDateString()}
        {policy.effectiveTo && ` — ${new Date(policy.effectiveTo).toLocaleDateString()}`}
        {policy.changeReason && ` · ${policy.changeReason}`}
      </div>
    </div>
  );
}

// ── Edit Form ──

function EditForm({
  formHoldMode, setFormHoldMode,
  formHoldPercent, setFormHoldPercent,
  formHoldFixed, setFormHoldFixed,
  formHoldMinimum, setFormHoldMinimum,
  formCancelBeforeOtwRefund, setFormCancelBeforeOtwRefund,
  formCancelAfterOtwDriver, setFormCancelAfterOtwDriver,
  formCancelAfterOtwPlatform, setFormCancelAfterOtwPlatform,
  formNoShowTiers, setFormNoShowTiers,
  formEffectiveFrom, setFormEffectiveFrom,
  formEffectiveTo, setFormEffectiveTo,
  formReason, setFormReason,
  saving, onSave, onCancel,
}: {
  formHoldMode: string; setFormHoldMode: (v: string) => void;
  formHoldPercent: string; setFormHoldPercent: (v: string) => void;
  formHoldFixed: string; setFormHoldFixed: (v: string) => void;
  formHoldMinimum: string; setFormHoldMinimum: (v: string) => void;
  formCancelBeforeOtwRefund: string; setFormCancelBeforeOtwRefund: (v: string) => void;
  formCancelAfterOtwDriver: string; setFormCancelAfterOtwDriver: (v: string) => void;
  formCancelAfterOtwPlatform: string; setFormCancelAfterOtwPlatform: (v: string) => void;
  formNoShowTiers: NoShowTier[]; setFormNoShowTiers: (v: NoShowTier[]) => void;
  formEffectiveFrom: string; setFormEffectiveFrom: (v: string) => void;
  formEffectiveTo: string; setFormEffectiveTo: (v: string) => void;
  formReason: string; setFormReason: (v: string) => void;
  saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  const inputCls = "w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none";

  return (
    <div className="space-y-5">
      {/* ── Hold Strategy ── */}
      <div>
        <SectionHeader
          title="Hold Strategy"
          subtitle="Controls what the rider sees held on their card at booking."
        />
        <InfoBox>
          <strong>Full Amount:</strong> Rider sees the entire ride price held.{' '}
          <strong>Deposit %:</strong> Rider sees a percentage of the ride price (e.g. 25% of $40 = $10).{' '}
          <strong>Fixed Deposit:</strong> Rider sees a flat dollar amount (e.g. $5) regardless of ride price.{' '}
          In all modes, Stripe silently authorizes the full amount so the ride can be charged on completion.
        </InfoBox>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="col-span-2">
            <label className="text-[10px] text-neutral-500 block mb-1">Hold Mode</label>
            <select value={formHoldMode} onChange={e => setFormHoldMode(e.target.value)}
              className={inputCls}>
              <option value="full">Full Ride Amount — rider sees full price held</option>
              <option value="deposit_percent">Deposit % — rider sees a percentage held</option>
              <option value="deposit_fixed">Fixed Deposit — rider sees a flat amount held</option>
            </select>
          </div>
          {formHoldMode === 'deposit_percent' && (
            <>
              <div>
                <label className="text-[10px] text-neutral-500 block mb-1">Deposit % of ride price</label>
                <div className="flex items-center gap-1">
                  <input type="number" step="1" min="1" max="100" value={formHoldPercent} onChange={e => setFormHoldPercent(e.target.value)} className={inputCls} />
                  <span className="text-neutral-500">%</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 block mb-1">Minimum deposit floor ($)</label>
                <input type="number" step="0.50" min="1" value={formHoldMinimum} onChange={e => setFormHoldMinimum(e.target.value)} className={inputCls} />
                <p className="text-[10px] text-neutral-600 mt-1">If the % is below this, this amount is used instead.</p>
              </div>
            </>
          )}
          {formHoldMode === 'deposit_fixed' && (
            <div>
              <label className="text-[10px] text-neutral-500 block mb-1">Fixed deposit amount ($)</label>
              <input type="number" step="0.50" min="1" value={formHoldFixed} onChange={e => setFormHoldFixed(e.target.value)} className={inputCls} />
              <p className="text-[10px] text-neutral-600 mt-1">This exact amount is held, capped at the ride price if the ride costs less.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Voluntary Cancellation ── */}
      <div className="pt-3 border-t border-neutral-800">
        <SectionHeader
          title="Voluntary Cancellation"
          subtitle="When a rider cancels. Charges are capped at the deposit — never the full ride."
        />
        <InfoBox>
          <strong>Before OTW:</strong> The driver hasn&apos;t started driving yet. Refund % controls how much of the deposit the rider gets back (100% = full refund).
          <br /><strong>After OTW:</strong> The driver is already en route and burning gas. Driver % and Platform % control who gets what share of the deposit. Remainder is refunded to the rider.
        </InfoBox>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Before OTW — Rider refund %</label>
            <div className="flex items-center gap-1">
              <input type="number" step="5" min="0" max="100" value={formCancelBeforeOtwRefund} onChange={e => setFormCancelBeforeOtwRefund(e.target.value)} className={inputCls} />
              <span className="text-neutral-500">%</span>
            </div>
            <p className="text-[10px] text-neutral-600 mt-1">Driver cancelled early — how much does rider get back?</p>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">After OTW — Driver gets %</label>
            <div className="flex items-center gap-1">
              <input type="number" step="5" min="0" max="100" value={formCancelAfterOtwDriver} onChange={e => setFormCancelAfterOtwDriver(e.target.value)} className={inputCls} />
              <span className="text-neutral-500">%</span>
            </div>
            <p className="text-[10px] text-neutral-600 mt-1">Driver already on the way — their share of the deposit.</p>
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">After OTW — Platform gets %</label>
            <div className="flex items-center gap-1">
              <input type="number" step="5" min="0" max="100" value={formCancelAfterOtwPlatform} onChange={e => setFormCancelAfterOtwPlatform(e.target.value)} className={inputCls} />
              <span className="text-neutral-500">%</span>
            </div>
            <p className="text-[10px] text-neutral-600 mt-1">Platform&apos;s cut. Set to 0 to give it all to the driver.</p>
          </div>
        </div>
        {(parseFloat(formCancelAfterOtwDriver) + parseFloat(formCancelAfterOtwPlatform)) > 100 && (
          <p className="text-[11px] text-red-400 mt-2">Driver % + Platform % exceeds 100%. The rider would owe more than the deposit.</p>
        )}
      </div>

      {/* ── No-Show Progressive Tiers ── */}
      <div className="pt-3 border-t border-neutral-800">
        <SectionHeader
          title="No-Show Platform Tiers"
          subtitle="When a rider no-shows, the FULL ride price is charged. These tiers control the platform's progressive cut."
        />
        <InfoBox>
          Each tier defines a dollar range and a rate. The platform takes that rate on dollars within the range.
          Like tax brackets — the first $15 might be at 5%, the next $15 at 10%, etc.
          The driver keeps everything the platform doesn&apos;t take.
          <strong> Lower rates on small amounts = fairer for cheap rides. Higher rates on big amounts = platform earns more on expensive no-shows.</strong>
        </InfoBox>
        <div className="space-y-2 mt-3">
          {formNoShowTiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-neutral-500 w-24 flex-shrink-0">
                {tier.up_to != null
                  ? (i === 0 ? `First $${tier.up_to}` : `$${formNoShowTiers[i - 1]?.up_to ?? 0} – $${tier.up_to}`)
                  : `Over $${tier.above ?? (formNoShowTiers[i - 1]?.up_to ?? 0)}`
                }
              </span>
              {tier.up_to != null && (
                <input type="number" step="5" min="1"
                  value={tier.up_to}
                  onChange={e => {
                    const updated = [...formNoShowTiers];
                    updated[i] = { ...tier, up_to: parseFloat(e.target.value) || 0 };
                    setFormNoShowTiers(updated);
                  }}
                  className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-white font-mono outline-none"
                  placeholder="$"
                />
              )}
              <span className="text-neutral-600">at</span>
              <input type="number" step="1" min="0" max="100"
                value={Math.round(tier.rate * 100)}
                onChange={e => {
                  const updated = [...formNoShowTiers];
                  updated[i] = { ...tier, rate: (parseFloat(e.target.value) || 0) / 100 };
                  setFormNoShowTiers(updated);
                }}
                className="w-16 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-white font-mono outline-none"
              />
              <span className="text-neutral-600">%</span>
              <button onClick={() => {
                const updated = formNoShowTiers.filter((_, idx) => idx !== i);
                setFormNoShowTiers(updated);
              }} className="text-red-400 hover:text-red-300 ml-1">x</button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                const lastUpTo = formNoShowTiers.filter(t => t.up_to != null).at(-1)?.up_to ?? 0;
                setFormNoShowTiers([...formNoShowTiers.filter(t => t.up_to != null), { up_to: lastUpTo + 25, rate: 0.10 }, ...formNoShowTiers.filter(t => t.above != null)]);
              }}
              className="text-[11px] text-blue-400 hover:underline"
            >+ Add tier</button>
            {!formNoShowTiers.some(t => t.above != null) && (
              <button
                onClick={() => {
                  const lastUpTo = formNoShowTiers.at(-1)?.up_to ?? 0;
                  setFormNoShowTiers([...formNoShowTiers, { above: lastUpTo, rate: 0.20 }]);
                }}
                className="text-[11px] text-blue-400 hover:underline"
              >+ Add &quot;over $X&quot; catch-all</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Effective dates + reason ── */}
      <div className="pt-3 border-t border-neutral-800">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Effective From</label>
            <input type="date" value={formEffectiveFrom} onChange={e => setFormEffectiveFrom(e.target.value)} className={inputCls + ' [color-scheme:dark]'} />
          </div>
          <div>
            <label className="text-[10px] text-neutral-500 block mb-1">Effective To (optional)</label>
            <input type="date" value={formEffectiveTo} onChange={e => setFormEffectiveTo(e.target.value)} className={inputCls + ' [color-scheme:dark]'} />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-[10px] text-neutral-500 block mb-1">Reason for change</label>
          <input type="text" value={formReason} onChange={e => setFormReason(e.target.value)}
            placeholder="e.g. Testing 25% deposit for rider conversion"
            className={inputCls} />
        </div>
      </div>

      {/* ── Save / Cancel ── */}
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={saving}
          className="flex-1 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium disabled:opacity-50">
          {saving ? 'Saving...' : 'Save & Activate'}
        </button>
        <button onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-400 text-sm font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}
