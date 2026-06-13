'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_FEE_POLICY,
  computeDeliverySplit,
  type FeePolicy,
  type CommissionMode,
} from '@/lib/partner/fee-policy';

const MARKETS: { slug: string; label: string }[] = [
  { slug: 'atl', label: 'Atlanta' },
  { slug: 'nola', label: 'New Orleans' },
];

interface ConfigRow {
  config_key: string;
  config_value: Record<string, unknown>;
  updated_at: string;
}

const GLOBAL_KEY = 'partner_fees.config';

function policyFromValue(v: Record<string, unknown> | undefined, fallback: FeePolicy): FeePolicy {
  if (!v) return fallback;
  return {
    commission_mode: (v.commission_mode as CommissionMode) ?? fallback.commission_mode,
    commission_bps: Number(v.commission_bps ?? fallback.commission_bps),
    commission_flat_cents: Number(v.commission_flat_cents ?? fallback.commission_flat_cents),
    min_commission_cents: Number(v.min_commission_cents ?? fallback.min_commission_cents),
    tip_takes_commission: Boolean(v.tip_takes_commission ?? fallback.tip_takes_commission),
    absorb_stripe_fee: Boolean(v.absorb_stripe_fee ?? fallback.absorb_stripe_fee),
  };
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function PartnerFeesClient() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [scope, setScope] = useState<string>('global'); // 'global' | market slug
  const [draft, setDraft] = useState<FeePolicy>(DEFAULT_FEE_POLICY);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/partner-fees');
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setMsg('Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const globalRow = rows.find((r) => r.config_key === GLOBAL_KEY);
  const globalPolicy = useMemo(
    () => policyFromValue(globalRow?.config_value, DEFAULT_FEE_POLICY),
    [globalRow],
  );

  const currentKey = scope === 'global' ? GLOBAL_KEY : `partner_fees:market:${scope}`;
  const currentRow = rows.find((r) => r.config_key === currentKey);
  const hasOverride = scope !== 'global' && !!currentRow;

  // Reset the draft whenever the selected scope (or its stored row) changes.
  const initial = useMemo<FeePolicy>(() => {
    if (scope === 'global') return globalPolicy;
    return currentRow ? policyFromValue(currentRow.config_value, globalPolicy) : globalPolicy;
  }, [scope, currentRow, globalPolicy]);

  useEffect(() => {
    setDraft(initial);
    setMsg(null);
  }, [initial]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/partner-fees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_key: currentKey, config_value: draft }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Save failed');
      }
      setMsg('Saved');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const resetOverride = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/partner-fees?key=${encodeURIComponent(currentKey)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Reset failed');
      setMsg('Override removed — this market now inherits the global policy');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof FeePolicy>(k: K, v: FeePolicy[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Partner Delivery Fees</h1>
        <p className="text-[12px] text-neutral-500 mt-1 leading-snug">
          HMU&apos;s cut of the delivery fee charged through the Partner API. Order charges are
          handled on the vendor&apos;s own Stripe and never touch HMU — this only governs the
          delivery fee, which is paid to the driver&apos;s connected account minus this commission.
        </p>
      </div>

      {/* Scope picker */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Scope</div>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="bg-neutral-950 border border-neutral-800 rounded-md px-3 py-1.5 text-sm text-white"
        >
          <option value="global">Global default</option>
          {MARKETS.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.label} ({m.slug})
            </option>
          ))}
        </select>
      </div>

      {scope !== 'global' && (
        <div
          className={`text-[11px] px-3 py-2 rounded-lg ${
            hasOverride
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-neutral-800/50 text-neutral-400 border border-neutral-800'
          }`}
        >
          {hasOverride
            ? `${scope.toUpperCase()} has its own fee override. Edit and save below, or reset to inherit the global policy.`
            : `${scope.toUpperCase()} inherits the global policy. Adjust below and save to create an override.`}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : (
        <div className="space-y-5 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          {/* Commission mode */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Commission mode
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['percent', 'flat', 'none'] as CommissionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set('commission_mode', mode)}
                  className={`rounded-lg py-2 text-xs font-semibold capitalize transition-colors ${
                    draft.commission_mode === mode
                      ? 'bg-white text-black'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {mode === 'none' ? 'No cut' : mode}
                </button>
              ))}
            </div>
          </div>

          {draft.commission_mode === 'percent' && (
            <>
              <SliderRow
                label="Commission"
                help="Percentage of the delivery fee HMU keeps."
                value={draft.commission_bps}
                min={0}
                max={5000}
                step={50}
                format={(v) => `${(v / 100).toFixed(1)}%`}
                onChange={(v) => set('commission_bps', v)}
              />
              <NumberRow
                label="Minimum commission"
                help="Commission never drops below this, even on small fees."
                unit="$"
                value={draft.min_commission_cents / 100}
                min={0}
                max={20}
                step={0.25}
                onChange={(v) => set('min_commission_cents', Math.round(v * 100))}
              />
            </>
          )}

          {draft.commission_mode === 'flat' && (
            <NumberRow
              label="Flat fee per delivery"
              help="Fixed amount HMU keeps from each delivery, regardless of fee size."
              unit="$"
              value={draft.commission_flat_cents / 100}
              min={0}
              max={20}
              step={0.25}
              onChange={(v) => set('commission_flat_cents', Math.round(v * 100))}
            />
          )}

          {draft.commission_mode === 'none' && (
            <div className="text-[12px] text-neutral-400 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2">
              HMU takes nothing from the delivery fee. The driver receives the full fee and tip.
            </div>
          )}

          <Divider />

          <ToggleRow
            label="Tips take commission"
            help="Off (recommended): 100% of tips pass through to the driver. Only applies in percent mode."
            value={draft.tip_takes_commission}
            onChange={(v) => set('tip_takes_commission', v)}
          />
          <ToggleRow
            label="HMU absorbs Stripe fee"
            help="On (recommended): matches the ride policy — HMU eats the ~2.9% + 30¢ processing fee out of its commission."
            value={draft.absorb_stripe_fee}
            onChange={(v) => set('absorb_stripe_fee', v)}
          />

          <SplitPreview policy={draft} />

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="flex-1 rounded-lg bg-white text-black text-sm font-semibold py-2.5 hover:bg-neutral-200 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : scope === 'global' ? 'Save global policy' : `Save ${scope.toUpperCase()} override`}
            </button>
            {hasOverride && (
              <button
                type="button"
                disabled={saving}
                onClick={resetOverride}
                className="rounded-lg border border-neutral-700 text-neutral-300 text-sm font-semibold px-4 hover:bg-neutral-800 disabled:opacity-40 transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {msg && <div className="text-[12px] text-neutral-400 text-center">{msg}</div>}
        </div>
      )}
    </div>
  );
}

function SplitPreview({ policy }: { policy: FeePolicy }) {
  const samples = [500, 1000, 2000];
  const tip = 200;
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
        Live preview · with a {dollars(tip)} tip
      </div>
      <div className="grid grid-cols-3 gap-2">
        {samples.map((fee) => {
          const s = computeDeliverySplit({ deliveryFeeCents: fee, tipCents: tip, policy });
          return (
            <div key={fee} className="bg-neutral-900 rounded-lg px-2 py-2 text-center">
              <div className="text-[10px] text-neutral-500">{dollars(fee)} fee</div>
              <div className="text-base font-semibold text-emerald-400 tabular-nums">
                {dollars(s.driverPayoutCents)}
              </div>
              <div className="text-[10px] text-neutral-500">to driver</div>
              <div className="text-[10px] text-neutral-600 mt-1">
                HMU {dollars(s.platformFeeCents)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-neutral-800" />;
}

function SliderRow({
  label, help, value, min, max, step, format, onChange,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 items-center">
      <div className="text-sm text-neutral-200">{label}</div>
      <div className="text-sm font-mono tabular-nums text-white w-20 text-right">
        {format ? format(value) : value}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="col-span-2 w-full accent-white"
      />
      {help && <div className="col-span-2 text-[11px] text-neutral-500 leading-snug">{help}</div>}
    </div>
  );
}

function NumberRow({
  label, help, unit, value, min, max, step, onChange,
}: {
  label: string;
  help?: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-neutral-200">{label}</div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(Math.max(min, Number((value - step).toFixed(2))))}
            className="w-7 h-7 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            −
          </button>
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-20 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white text-right tabular-nums"
          />
          <button
            type="button"
            onClick={() => onChange(Math.min(max, Number((value + step).toFixed(2))))}
            className="w-7 h-7 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            +
          </button>
          {unit && <div className="text-xs text-neutral-500 w-6">{unit}</div>}
        </div>
      </div>
      {help && <div className="text-[11px] text-neutral-500 leading-snug mt-1">{help}</div>}
    </div>
  );
}

function ToggleRow({
  label, help, value, onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <div className="text-sm text-neutral-200">{label}</div>
        {help && <div className="text-[11px] text-neutral-500 leading-snug mt-1">{help}</div>}
      </div>
      <Switch checked={value} onChange={onChange} />
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 ${
        checked ? 'bg-white' : 'bg-neutral-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
        }`}
      />
    </button>
  );
}
