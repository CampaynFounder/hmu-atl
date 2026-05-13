'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

// ── Types mirror lib/blast/config.ts (kept inline so this client doesn't import server code) ──

interface MatchingConfig {
  weights: {
    proximity_to_pickup: number;
    recency_signin: number;
    sex_match: number;
    chill_score: number;
    advance_notice_fit: number;
    profile_view_count: number;
    completed_rides: number;
    low_recent_pass_rate: number;
  };
  filters: {
    max_distance_mi: number;
    min_chill_score: number;
    must_match_sex_preference: boolean;
    must_be_signed_in_within_hours: number;
    exclude_if_in_active_ride: boolean;
    exclude_if_today_passed_count_gte: number;
  };
  limits: {
    max_drivers_to_notify: number;
    min_drivers_to_notify: number;
    expand_radius_step_mi: number;
    expand_radius_max_mi: number;
    same_driver_dedupe_minutes: number;
    prioritize_hmu_first: boolean;
    hmu_first_reserved_slots: number;
  };
  expiry: {
    default_blast_minutes: number;
    scheduled_blast_lead_minutes: number;
  };
  deposit: {
    default_amount_cents: number;
    percent_of_fare: number;
    max_deposit_cents: number;
  };
  default_price_dollars: number;
  price_per_mile_dollars: number;
  max_price_dollars: number;
  label?: string;
}

interface ConfigRow {
  config_key: string;
  config_value: Record<string, unknown>;
  updated_at: string;
}

const SIMPLE_DESCRIPTIONS: Record<string, string> = {
  'blast.sms_kill_switch':
    'Master OFF for blast SMS notifications. ON = push only.',
  'blast.max_sms_per_blast':
    'Hard ceiling on SMS sends per single blast.',
  'blast.rate_limit_per_phone_hour':
    'Max blasts a single phone can send per rolling hour.',
  'blast.rate_limit_per_phone_day':
    'Max blasts a single phone can send per rolling day.',
  'blast.draft_ttl_minutes':
    'How long the in-progress blast form lives in localStorage before clearing.',
};

const WEIGHT_LABELS: Record<keyof MatchingConfig['weights'], { label: string; help: string }> = {
  proximity_to_pickup: { label: 'Proximity to pickup', help: 'How close the driver is right now.' },
  recency_signin: { label: 'Recent activity', help: 'Driver active in the app recently.' },
  sex_match: { label: 'Gender match', help: 'Matches rider preference (or pref=any).' },
  chill_score: { label: 'Chill score', help: 'Driver\'s rolling rating.' },
  advance_notice_fit: { label: 'Advance notice fit', help: 'Lead time vs. driver\'s required notice.' },
  profile_view_count: { label: 'Profile views', help: 'Social proof — popular profiles rank higher.' },
  completed_rides: { label: 'Completed rides', help: 'Veterans rank higher.' },
  low_recent_pass_rate: { label: 'Low pass rate', help: 'Penalize drivers passing a lot today.' },
};

export default function BlastConfigClient() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/blast-config');
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as { rows: ConfigRow[] };
      setRows(data.rows ?? []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const saveRow = useCallback(
    async (key: string, value: object): Promise<boolean> => {
      try {
        const res = await fetch('/api/admin/blast-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_key: key, config_value: value }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error || 'Save failed');
          return false;
        }
        showToast(`${key.replace('blast.', '').replace('blast_matching_v1', 'matching')} saved`);
        await fetchConfig();
        return true;
      } catch {
        setError('Network error');
        return false;
      }
    },
    [fetchConfig, showToast],
  );

  const matchingRow = rows.find((r) => r.config_key === 'blast_matching_v1');
  const simpleRows = rows.filter((r) => r.config_key.startsWith('blast.'));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Blast Config</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Tunable knobs for the blast booking flow. Changes propagate within ~60s (cache TTL).
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
          {matchingRow && (
            <MatchingEditor
              key={matchingRow.updated_at}
              initial={matchingRow.config_value as unknown as MatchingConfig}
              updatedAt={matchingRow.updated_at}
              onSave={(v) => saveRow('blast_matching_v1', v)}
            />
          )}

          <section>
            <h2 className="text-sm font-semibold text-neutral-300 mb-2">Cost & abuse knobs</h2>
            <div className="space-y-2">
              {simpleRows.map((r) => (
                <SimpleKnobRow
                  key={r.config_key + r.updated_at}
                  configKey={r.config_key}
                  initial={r.config_value}
                  updatedAt={r.updated_at}
                  onSave={(v) => saveRow(r.config_key, v)}
                />
              ))}
              {simpleRows.length === 0 && (
                <div className="text-neutral-600 text-xs">No blast.* rows in DB. Did the migration run?</div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ── Matching algorithm editor ──────────────────────────────────────────────

function MatchingEditor({
  initial,
  updatedAt,
  onSave,
}: {
  initial: MatchingConfig;
  updatedAt: string;
  onSave: (next: MatchingConfig) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<MatchingConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const weightSum = useMemo(
    () => Object.values(draft.weights).reduce((a, b) => a + b, 0),
    [draft.weights],
  );
  const weightSumOk = Math.abs(weightSum - 1) < 0.05;

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (!ok) return;
  };

  return (
    <section className="bg-neutral-900 border border-amber-500/40 rounded-2xl">
      <header className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Matching algorithm</h2>
            <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
              blast_matching_v1
            </span>
          </div>
          <p className="text-[11px] text-neutral-600 mt-1">Updated {new Date(updatedAt).toLocaleString()}</p>
        </div>
        <button
          onClick={() => setShowRaw((s) => !s)}
          className="text-[11px] text-neutral-500 hover:text-white underline"
        >
          {showRaw ? 'Use UI' : 'Raw JSON'}
        </button>
      </header>

      {showRaw ? (
        <RawJsonEditor
          value={draft}
          onChange={(v) => setDraft(v as MatchingConfig)}
        />
      ) : (
        <div className="px-4 pb-4 space-y-6">
          {/* Weights */}
          <Subsection title="Weights" subtitle="What the algorithm cares about. Should sum to ~1.0.">
            <div className="space-y-3">
              {(Object.keys(draft.weights) as Array<keyof MatchingConfig['weights']>).map((k) => (
                <SliderRow
                  key={k}
                  label={WEIGHT_LABELS[k].label}
                  help={WEIGHT_LABELS[k].help}
                  value={draft.weights[k]}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => v.toFixed(2)}
                  onChange={(v) => setDraft((d) => ({ ...d, weights: { ...d.weights, [k]: v } }))}
                />
              ))}
              <div
                className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${
                  weightSumOk
                    ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}
              >
                <span>Sum of weights</span>
                <span className="font-mono">
                  {weightSum.toFixed(2)} {weightSumOk ? '✓' : '— aim for ~1.0'}
                </span>
              </div>
            </div>
          </Subsection>

          {/* Filters */}
          <Subsection title="Hard filters" subtitle="Drivers who fail any of these are excluded outright.">
            <div className="space-y-3">
              <NumberRow
                label="Max distance"
                unit="mi"
                value={draft.filters.max_distance_mi}
                step={0.5}
                min={0.5}
                max={50}
                onChange={(v) => setDraft((d) => ({ ...d, filters: { ...d.filters, max_distance_mi: v } }))}
              />
              <NumberRow
                label="Min chill score"
                unit="%"
                value={draft.filters.min_chill_score}
                step={5}
                min={0}
                max={100}
                onChange={(v) => setDraft((d) => ({ ...d, filters: { ...d.filters, min_chill_score: v } }))}
              />
              <NumberRow
                label="Must be signed in within"
                unit="hrs"
                value={draft.filters.must_be_signed_in_within_hours}
                step={1}
                min={1}
                max={720}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, filters: { ...d.filters, must_be_signed_in_within_hours: v } }))
                }
              />
              <NumberRow
                label="Exclude after pass count today"
                unit="passes"
                value={draft.filters.exclude_if_today_passed_count_gte}
                step={1}
                min={1}
                max={50}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, filters: { ...d.filters, exclude_if_today_passed_count_gte: v } }))
                }
              />
              <ToggleRow
                label="Require gender match"
                help="Hard-exclude drivers who don't match the rider's stated preference. OFF = treat as a soft preference (still scored)."
                value={draft.filters.must_match_sex_preference}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, filters: { ...d.filters, must_match_sex_preference: v } }))
                }
              />
              <ToggleRow
                label="Exclude drivers in active ride"
                help="Hide drivers currently on an OTW/HERE/active ride."
                value={draft.filters.exclude_if_in_active_ride}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, filters: { ...d.filters, exclude_if_in_active_ride: v } }))
                }
              />
            </div>
          </Subsection>

          {/* Limits */}
          <Subsection title="Fanout limits" subtitle="How many drivers get notified, how wide we cast.">
            <div className="space-y-3">
              <NumberRow
                label="Max drivers to notify"
                value={draft.limits.max_drivers_to_notify}
                step={1}
                min={1}
                max={50}
                onChange={(v) => setDraft((d) => ({ ...d, limits: { ...d.limits, max_drivers_to_notify: v } }))}
              />
              <NumberRow
                label="Min drivers to notify"
                help="If fewer match, we widen the radius."
                value={draft.limits.min_drivers_to_notify}
                step={1}
                min={1}
                max={20}
                onChange={(v) => setDraft((d) => ({ ...d, limits: { ...d.limits, min_drivers_to_notify: v } }))}
              />
              <NumberRow
                label="Radius expansion step"
                unit="mi"
                value={draft.limits.expand_radius_step_mi}
                step={0.5}
                min={0.5}
                max={10}
                onChange={(v) => setDraft((d) => ({ ...d, limits: { ...d.limits, expand_radius_step_mi: v } }))}
              />
              <NumberRow
                label="Radius expansion max"
                unit="mi"
                value={draft.limits.expand_radius_max_mi}
                step={1}
                min={1}
                max={100}
                onChange={(v) => setDraft((d) => ({ ...d, limits: { ...d.limits, expand_radius_max_mi: v } }))}
              />
              <NumberRow
                label="Same-driver dedupe window"
                unit="min"
                help="Don't ping the same driver twice for blasts from this rider in this window."
                value={draft.limits.same_driver_dedupe_minutes}
                step={5}
                min={0}
                max={240}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, limits: { ...d.limits, same_driver_dedupe_minutes: v } }))
                }
              />
              <ToggleRow
                label="Prioritize HMU First drivers"
                help="Reserve a chunk of fanout slots for HMU First subscribers."
                value={draft.limits.prioritize_hmu_first}
                onChange={(v) => setDraft((d) => ({ ...d, limits: { ...d.limits, prioritize_hmu_first: v } }))}
              />
              {draft.limits.prioritize_hmu_first && (
                <NumberRow
                  label="HMU First reserved slots"
                  value={draft.limits.hmu_first_reserved_slots}
                  step={1}
                  min={0}
                  max={draft.limits.max_drivers_to_notify}
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, limits: { ...d.limits, hmu_first_reserved_slots: v } }))
                  }
                />
              )}
            </div>
          </Subsection>

          {/* Expiry */}
          <Subsection title="Expiry" subtitle="How long blasts stay open.">
            <div className="space-y-3">
              <NumberRow
                label="Default blast window"
                unit="min"
                value={draft.expiry.default_blast_minutes}
                step={1}
                min={1}
                max={120}
                onChange={(v) => setDraft((d) => ({ ...d, expiry: { ...d.expiry, default_blast_minutes: v } }))}
              />
              <NumberRow
                label="Scheduled blast lead time"
                unit="min"
                help="For scheduled blasts, how long before the time we open the offer board."
                value={draft.expiry.scheduled_blast_lead_minutes}
                step={5}
                min={5}
                max={1440}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, expiry: { ...d.expiry, scheduled_blast_lead_minutes: v } }))
                }
              />
            </div>
          </Subsection>

          {/* Deposit */}
          <Subsection title="Deposit" subtitle="Hold amount placed at blast send.">
            <div className="space-y-3">
              <DollarRow
                label="Min deposit"
                cents={draft.deposit.default_amount_cents}
                step={1}
                min={1}
                max={50}
                onChange={(cents) => setDraft((d) => ({ ...d, deposit: { ...d.deposit, default_amount_cents: cents } }))}
              />
              <SliderRow
                label="% of fare held"
                value={draft.deposit.percent_of_fare}
                min={0}
                max={1}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setDraft((d) => ({ ...d, deposit: { ...d.deposit, percent_of_fare: v } }))}
              />
              <DollarRow
                label="Max deposit"
                cents={draft.deposit.max_deposit_cents}
                step={5}
                min={1}
                max={500}
                onChange={(cents) => setDraft((d) => ({ ...d, deposit: { ...d.deposit, max_deposit_cents: cents } }))}
              />
            </div>
          </Subsection>

          {/* Pricing */}
          <Subsection title="Pricing defaults" subtitle="Suggested + capped prices on the form.">
            <div className="space-y-3">
              <NumberRow
                label="Default price"
                unit="$"
                value={draft.default_price_dollars}
                step={1}
                min={1}
                max={500}
                onChange={(v) => setDraft((d) => ({ ...d, default_price_dollars: v }))}
              />
              <NumberRow
                label="Per-mile rate"
                unit="$"
                value={draft.price_per_mile_dollars}
                step={0.25}
                min={0.25}
                max={20}
                onChange={(v) => setDraft((d) => ({ ...d, price_per_mile_dollars: v }))}
              />
              <NumberRow
                label="Max price allowed"
                unit="$"
                value={draft.max_price_dollars}
                step={10}
                min={10}
                max={5000}
                onChange={(v) => setDraft((d) => ({ ...d, max_price_dollars: v }))}
              />
            </div>
          </Subsection>
        </div>
      )}

      <footer className="px-4 pb-4 pt-2 border-t border-neutral-800 flex items-center justify-between bg-neutral-900 sticky bottom-0">
        <div className="text-[11px] text-neutral-500">
          {dirty ? 'Unsaved changes' : 'No changes'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setDraft(initial)}
            disabled={!dirty}
            className="text-xs text-neutral-500 hover:text-white disabled:text-neutral-700 px-3 py-1.5"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-600 text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save matching config'}
          </button>
        </div>
      </footer>
    </section>
  );
}

// ── Simple knob row (one row per blast.* key) ──────────────────────────────

function SimpleKnobRow({
  configKey,
  initial,
  updatedAt,
  onSave,
}: {
  configKey: string;
  initial: Record<string, unknown>;
  updatedAt: string;
  onSave: (v: Record<string, unknown>) => Promise<boolean>;
}) {
  const [value, setValue] = useState<unknown>(initial.value);
  const [saving, setSaving] = useState(false);
  const dirty = value !== initial.value;
  const min = typeof initial.min === 'number' ? initial.min : undefined;
  const max = typeof initial.max === 'number' ? initial.max : undefined;
  const isBool = typeof initial.value === 'boolean';
  const isNum = typeof initial.value === 'number';
  const desc = SIMPLE_DESCRIPTIONS[configKey];

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave({ ...initial, value });
    setSaving(false);
    if (!ok) {
      setValue(initial.value);
    }
  };

  const shortName = configKey.replace('blast.', '');

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <code className="text-xs font-semibold text-white">{shortName}</code>
        {desc && <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{desc}</p>}
      </div>
      <div className="flex items-center gap-2">
        {isBool && (
          <Switch checked={Boolean(value)} onChange={(v) => setValue(v)} />
        )}
        {isNum && (
          <input
            type="number"
            value={Number(value)}
            min={min}
            max={max}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-20 bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white text-right tabular-nums"
          />
        )}
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="text-xs bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-neutral-600 text-white font-medium px-3 py-1.5 rounded-md transition-colors"
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>
      <div className="text-[10px] text-neutral-700 hidden md:block">
        {new Date(updatedAt).toLocaleDateString()}
      </div>
    </div>
  );
}

// ── Reusable controls ──────────────────────────────────────────────────────

function Subsection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold">{title}</h3>
        {subtitle && <p className="text-[11px] text-neutral-600 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  help,
  value,
  min,
  max,
  step,
  format,
  onChange,
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
      <div className="text-sm font-mono tabular-nums text-white w-12 text-right">
        {format ? format(value) : value.toFixed(2)}
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
      {help && <div className="col-span-2 text-[11px] text-neutral-600 -mt-1">{help}</div>}
    </div>
  );
}

function NumberRow({
  label,
  help,
  unit,
  value,
  min,
  max,
  step,
  onChange,
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
            onClick={() => onChange(Math.max(min, value - step))}
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
            onClick={() => onChange(Math.min(max, value + step))}
            className="w-7 h-7 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          >
            +
          </button>
          {unit && <div className="text-xs text-neutral-500 w-8">{unit}</div>}
        </div>
      </div>
      {help && <div className="text-[11px] text-neutral-600 mt-1">{help}</div>}
    </div>
  );
}

function DollarRow({
  label,
  cents,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  cents: number;
  step: number;
  min: number;
  max: number;
  onChange: (cents: number) => void;
}) {
  const dollars = cents / 100;
  return (
    <NumberRow
      label={label}
      unit="$"
      value={dollars}
      min={min}
      max={max}
      step={step}
      onChange={(v) => onChange(Math.round(v * 100))}
    />
  );
}

function ToggleRow({
  label,
  help,
  value,
  onChange,
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
        {help && <div className="text-[11px] text-neutral-600 mt-0.5">{help}</div>}
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
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full ${
          checked ? 'bg-black' : 'bg-neutral-300'
        } shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function RawJsonEditor({
  value,
  onChange,
}: {
  value: object;
  onChange: (v: object) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);

  const apply = (next: string) => {
    setText(next);
    try {
      const parsed = JSON.parse(next);
      setErr(null);
      onChange(parsed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <div className="px-4 pb-4">
      <textarea
        value={text}
        onChange={(e) => apply(e.target.value)}
        rows={28}
        spellCheck={false}
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-white"
      />
      {err && <div className="text-xs text-red-400 mt-2">{err}</div>}
    </div>
  );
}
