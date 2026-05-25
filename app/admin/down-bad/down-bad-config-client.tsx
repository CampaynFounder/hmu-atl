'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DownBadConfig {
  enabled: boolean;
  fee_flat_cents: number;
  fee_pct: number;
  cash_floor_cents: number;
  cash_ceiling_cents: number;
  sum_extra_max_chars: number;
  require_min_rides: number;
  require_min_chill_score: number;
  expiry_hours: number;
}

interface DownBadDisclaimer {
  rider_text: string;
  driver_text: string;
}

const DEFAULT_CONFIG: DownBadConfig = {
  enabled: false,
  fee_flat_cents: 50,
  fee_pct: 0,
  cash_floor_cents: 500,
  cash_ceiling_cents: 3000,
  sum_extra_max_chars: 120,
  require_min_rides: 0,
  require_min_chill_score: 0,
  expiry_hours: 4,
};

const DEFAULT_DISCLAIMER: DownBadDisclaimer = {
  rider_text: '',
  driver_text: '',
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function DownBadConfigClient() {
  const [config, setConfig] = useState<DownBadConfig>(DEFAULT_CONFIG);
  const [disclaimer, setDisclaimer] = useState<DownBadDisclaimer>(DEFAULT_DISCLAIMER);
  const [configUpdatedAt, setConfigUpdatedAt] = useState<string | null>(null);
  const [disclaimerUpdatedAt, setDisclaimerUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState<'config' | 'disclaimer' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/down-bad-config');
      if (!res.ok) { setError('Failed to load config'); return; }
      const data = await res.json();
      for (const row of (data.rows ?? []) as { config_key: string; config_value: Record<string, unknown>; updated_at: string }[]) {
        if (row.config_key === 'down_bad.config') {
          setConfig({ ...DEFAULT_CONFIG, ...(row.config_value as Partial<DownBadConfig>) });
          setConfigUpdatedAt(row.updated_at);
        }
        if (row.config_key === 'down_bad.disclaimer') {
          setDisclaimer({ ...DEFAULT_DISCLAIMER, ...(row.config_value as Partial<DownBadDisclaimer>) });
          setDisclaimerUpdatedAt(row.updated_at);
        }
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = useCallback(async () => {
    setSaving('config');
    setError(null);
    try {
      const res = await fetch('/api/admin/down-bad-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_key: 'down_bad.config', config_value: config }),
      });
      if (res.ok) { showToast('Config saved'); fetchConfig(); }
      else { const b = await res.json().catch(() => ({})); setError(b.error || 'Save failed'); }
    } catch { setError('Network error'); }
    finally { setSaving(null); }
  }, [config, fetchConfig]);

  const saveDisclaimer = useCallback(async () => {
    setSaving('disclaimer');
    setError(null);
    if (!disclaimer.rider_text.trim() || !disclaimer.driver_text.trim()) {
      setError('Both disclaimer texts are required');
      setSaving(null);
      return;
    }
    try {
      const res = await fetch('/api/admin/down-bad-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_key: 'down_bad.disclaimer', config_value: disclaimer }),
      });
      if (res.ok) { showToast('Disclaimer saved'); fetchConfig(); }
      else { const b = await res.json().catch(() => ({})); setError(b.error || 'Save failed'); }
    } catch { setError('Network error'); }
    finally { setSaving(null); }
  }, [disclaimer, fetchConfig]);

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Down Bad Config</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Feature flags, fee structure, cash limits, and disclaimers for the Down Bad booking type.
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
      ) : (
        <>
          {/* ── Config card ─────────────────────────────────────────────── */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-6">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Feature Settings</div>
                {configUpdatedAt && (
                  <div className="text-[11px] text-neutral-600 mt-0.5">
                    Updated {new Date(configUpdatedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            {/* Enable toggle */}
            <ToggleRow
              label="Down Bad enabled"
              help="Master switch. When OFF, riders cannot post Down Bad requests and the driver swipe deck is hidden."
              value={config.enabled}
              onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
            />

            <Divider />

            {/* Fee structure */}
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Platform Fee</div>
            </div>

            <SliderRow
              label="Flat facilitation fee"
              help="Extracted from the deposit at Start Ride capture alongside the normal capture. $0.00 = no flat fee."
              value={config.fee_flat_cents}
              min={0}
              max={200}
              step={5}
              format={(v) => `$${(v / 100).toFixed(2)}`}
              onChange={(v) => setConfig((c) => ({ ...c, fee_flat_cents: v }))}
            />

            <SliderRow
              label="Percentage fee"
              help="% of the declared cash amount. 0% at launch — ramp up once trust is established."
              value={config.fee_pct}
              min={0}
              max={15}
              step={0.5}
              format={(v) => `${v.toFixed(1)}%`}
              onChange={(v) => setConfig((c) => ({ ...c, fee_pct: v }))}
            />

            <Divider />

            {/* Cash range */}
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Cash Range</div>
            </div>

            <SliderRow
              label="Cash floor"
              help="Minimum amount a rider must declare. Can't post below this."
              value={config.cash_floor_cents}
              min={100}
              max={2000}
              step={100}
              format={(v) => `$${(v / 100).toFixed(0)}`}
              onChange={(v) => setConfig((c) => ({ ...c, cash_floor_cents: Math.min(v, config.cash_ceiling_cents - 100) }))}
            />

            <SliderRow
              label="Cash ceiling"
              help="Maximum amount a rider can declare. Hard cap enforced at submission."
              value={config.cash_ceiling_cents}
              min={500}
              max={10000}
              step={500}
              format={(v) => `$${(v / 100).toFixed(0)}`}
              onChange={(v) => setConfig((c) => ({ ...c, cash_ceiling_cents: Math.max(v, config.cash_floor_cents + 100) }))}
            />

            <Divider />

            {/* Quality gates */}
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Rider Quality Gates</div>
            </div>

            <SliderRow
              label="Sum extra max characters"
              help="Max length of the rider's sum extra description text. 0 = no limit (not recommended)."
              value={config.sum_extra_max_chars}
              min={60}
              max={500}
              step={10}
              format={(v) => `${v} chars`}
              onChange={(v) => setConfig((c) => ({ ...c, sum_extra_max_chars: v }))}
            />

            <SliderRow
              label="Min completed rides"
              help="Rider must have this many completed rides before they can post Down Bad. 0 = no gate."
              value={config.require_min_rides}
              min={0}
              max={20}
              step={1}
              format={(v) => v === 0 ? 'No gate' : `${v} rides`}
              onChange={(v) => setConfig((c) => ({ ...c, require_min_rides: v }))}
            />

            <SliderRow
              label="Min Chill Score"
              help="Minimum Chill Score % required to post. 0 = no gate. Raise this to protect drivers from low-trust riders."
              value={config.require_min_chill_score}
              min={0}
              max={100}
              step={5}
              format={(v) => v === 0 ? 'No gate' : `${v}%`}
              onChange={(v) => setConfig((c) => ({ ...c, require_min_chill_score: v }))}
            />

            <Divider />

            {/* Post expiry */}
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Post Lifecycle</div>
            </div>

            <SliderRow
              label="Post expiry window"
              help="How long a Down Bad post stays active before it auto-expires. Shorter = more urgent feel. Longer = more driver coverage."
              value={config.expiry_hours}
              min={0.25}
              max={24}
              step={0.25}
              format={(v) => {
                const totalMins = Math.round(v * 60);
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;
                if (h === 0) return `${m}m`;
                if (m === 0) return `${h}h`;
                return `${h}h ${m}m`;
              }}
              onChange={(v) => setConfig((c) => ({ ...c, expiry_hours: v }))}
            />

            <button
              type="button"
              disabled={saving === 'config'}
              onClick={saveConfig}
              className="w-full mt-2 rounded-lg bg-white text-black text-sm font-semibold py-2.5 hover:bg-neutral-200 disabled:opacity-40 transition-colors"
            >
              {saving === 'config' ? 'Saving…' : 'Save Settings'}
            </button>
          </div>

          {/* ── Disclaimer card ──────────────────────────────────────────── */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Disclaimers</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  Shown before riders post and before drivers opt in. Keep it plain — no HTML or markdown.
                </div>
                {disclaimerUpdatedAt && (
                  <div className="text-[11px] text-neutral-600 mt-0.5">
                    Updated {new Date(disclaimerUpdatedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            <DisclaimerField
              label="Rider disclaimer"
              help={"Shown to riders before they tap \"I'm Down\" and submit a Down Bad post."}
              value={disclaimer.rider_text}
              onChange={(v) => setDisclaimer((d) => ({ ...d, rider_text: v }))}
            />

            <DisclaimerField
              label="Driver disclaimer"
              help="Shown to drivers before they toggle on accepts_down_bad in profile settings."
              value={disclaimer.driver_text}
              onChange={(v) => setDisclaimer((d) => ({ ...d, driver_text: v }))}
            />

            {/* Live previews */}
            {(disclaimer.rider_text || disclaimer.driver_text) && (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Preview</div>
                {disclaimer.rider_text && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-neutral-500">Rider sees:</div>
                    <div className="bg-neutral-950 rounded-lg p-4 text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap border border-neutral-800">
                      {disclaimer.rider_text}
                    </div>
                  </div>
                )}
                {disclaimer.driver_text && (
                  <div className="space-y-1">
                    <div className="text-[11px] text-neutral-500">Driver sees:</div>
                    <div className="bg-neutral-950 rounded-lg p-4 text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap border border-neutral-800">
                      {disclaimer.driver_text}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={saving === 'disclaimer'}
              onClick={saveDisclaimer}
              className="w-full rounded-lg bg-white text-black text-sm font-semibold py-2.5 hover:bg-neutral-200 disabled:opacity-40 transition-colors"
            >
              {saving === 'disclaimer' ? 'Saving…' : 'Save Disclaimers'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Divider() {
  return <div className="border-t border-neutral-800" />;
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

function DisclaimerField({
  label, help, value, onChange,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm text-neutral-200">{label}</div>
      {help && <div className="text-[11px] text-neutral-500">{help}</div>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600 resize-y leading-relaxed"
        placeholder="Enter disclaimer text…"
      />
      <div className="text-[11px] text-neutral-600 text-right">{value.length} chars</div>
    </div>
  );
}
