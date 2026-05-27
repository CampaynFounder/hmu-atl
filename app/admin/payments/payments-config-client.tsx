'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

// ── Types (mirror lib/payments/config.ts — inline to avoid server import) ──

interface AddOnReserveConfig {
  mode: 'menu_total_capped' | 'percent_of_fare' | 'none';
  percentFloor: number;
  absoluteFloorDollars: number;
}

interface LegacyFullFareConfig {
  visibleDepositMode: 'deposit_percent' | 'deposit_fixed' | 'full';
  visibleDepositPercent: number;
  visibleDepositFixed: number;
  visibleDepositMinimum: number;
}

interface DepositOnlyPayConfig {
  feeFloorCents: number;
  feePercent: number;
  depositMin: number;
  depositIncrement: number;
  depositMaxPctOfFare: number;
  extrasFeePercent: number;
}

interface PaymentsConfig {
  addOnReserve: AddOnReserveConfig;
  legacyFullFare: LegacyFullFareConfig;
  depositOnly: DepositOnlyPayConfig;
}

const DEFAULTS: PaymentsConfig = {
  addOnReserve: { mode: 'menu_total_capped', percentFloor: 0.25, absoluteFloorDollars: 50 },
  legacyFullFare: { visibleDepositMode: 'deposit_percent', visibleDepositPercent: 0.25, visibleDepositFixed: 5, visibleDepositMinimum: 5 },
  depositOnly: { feeFloorCents: 150, feePercent: 0.20, depositMin: 5, depositIncrement: 1, depositMaxPctOfFare: 0.50, extrasFeePercent: 0.20 },
};

interface ConfigRow {
  config_key: string;
  config_value: Record<string, unknown>;
  updated_at: string;
}

const MARKETS: { slug: string; label: string }[] = [
  { slug: 'atl', label: 'Atlanta' },
  { slug: 'nola', label: 'New Orleans' },
];

// ── Pure math helpers (no server imports) ──────────────────────────────────

function computeAddOnReserve(menuTotal: number, ridePrice: number, cfg: AddOnReserveConfig): number {
  if (cfg.mode === 'none' || menuTotal <= 0) return 0;
  if (cfg.mode === 'percent_of_fare') return Math.round(ridePrice * cfg.percentFloor * 100) / 100;
  const cap = Math.max(cfg.absoluteFloorDollars, ridePrice * cfg.percentFloor);
  return Math.round(Math.min(menuTotal, cap) * 100) / 100;
}

function clampDeposit(requested: number, totalFare: number, cfg: DepositOnlyPayConfig): number {
  const cap = totalFare * cfg.depositMaxPctOfFare;
  const min = Math.min(cfg.depositMin, totalFare);
  const clamped = Math.max(min, Math.min(requested, cap));
  const inc = Math.max(cfg.depositIncrement, 0.01);
  return Math.round(Math.max(min, Math.min(Math.round(clamped / inc) * inc, cap)) * 100) / 100;
}

interface PreviewResult {
  mode: string;
  stripeAuth: number;
  visibleDeposit: number;
  stripeFee: number;
  platformFee: number;
  platformNet: number;
  driverPayout: number;
  cashRemainder: number;
  effectiveRate: number;
}

const PLATFORM_FEE_RATE = 0.10; // free tier, simplified for preview

function previewLegacy(ridePrice: number, menuTotal: number, cfg: PaymentsConfig): PreviewResult {
  const reserve = computeAddOnReserve(menuTotal, ridePrice, cfg.addOnReserve);
  const stripeAuth = ridePrice + reserve;

  // Visible deposit (what rider sees — Stripe auth is always full)
  let visibleDeposit: number;
  switch (cfg.legacyFullFare.visibleDepositMode) {
    case 'deposit_percent':
      visibleDeposit = Math.max(
        ridePrice * cfg.legacyFullFare.visibleDepositPercent,
        cfg.legacyFullFare.visibleDepositMinimum,
      );
      break;
    case 'deposit_fixed':
      visibleDeposit = cfg.legacyFullFare.visibleDepositFixed;
      break;
    default:
      visibleDeposit = ridePrice;
  }
  visibleDeposit = Math.min(Math.round(visibleDeposit * 100) / 100, ridePrice);

  // Capture happens at start ride = ridePrice (no add-ons in preview)
  const stripeFee = Math.round((ridePrice * 0.029 + 0.30) * 100) / 100;
  const netAfterStripe = ridePrice - stripeFee;
  const platformFee = Math.round(netAfterStripe * PLATFORM_FEE_RATE * 100) / 100;
  const platformNet = platformFee;
  const driverPayout = Math.round((netAfterStripe - platformFee) * 100) / 100;

  return {
    mode: 'Legacy Full Fare',
    stripeAuth,
    visibleDeposit,
    stripeFee,
    platformFee,
    platformNet,
    driverPayout,
    cashRemainder: 0,
    effectiveRate: ridePrice > 0 ? platformFee / ridePrice : 0,
  };
}

function previewDepositOnly(ridePrice: number, cfg: PaymentsConfig): PreviewResult {
  // Assume rider picks 25% of fare as their deposit for preview
  const requested = Math.round(ridePrice * 0.25 * 100) / 100;
  const visibleDeposit = clampDeposit(requested, ridePrice, cfg.depositOnly);
  const depositCents = Math.round(visibleDeposit * 100);

  const feeCents = Math.max(cfg.depositOnly.feeFloorCents, Math.round(depositCents * cfg.depositOnly.feePercent));
  const stripeFee = Math.round((depositCents * 0.029 + 30) / 100 * 100) / 100;
  const platformFee = feeCents / 100;
  const platformNet = Math.max(0, Math.round((platformFee - stripeFee) * 100) / 100);
  const driverPayout = Math.round((depositCents - feeCents) / 100 * 100) / 100;
  const cashRemainder = Math.max(0, Math.round((ridePrice - visibleDeposit) * 100) / 100);

  return {
    mode: 'Deposit Only',
    stripeAuth: visibleDeposit,
    visibleDeposit,
    stripeFee,
    platformFee,
    platformNet,
    driverPayout,
    cashRemainder,
    effectiveRate: ridePrice > 0 ? platformNet / ridePrice : 0,
  };
}

// ── Root component ─────────────────────────────────────────────────────────

export default function PaymentsConfigClient() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/payments-config');
      if (!res.ok) throw new Error('Failed to load');
      const data = (await res.json()) as { rows: ConfigRow[] };
      setRows(data.rows ?? []);
    } catch {
      setError('Network error — check console');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  }, []);

  const saveRow = useCallback(
    async (key: string, value: object): Promise<boolean> => {
      try {
        const res = await fetch('/api/admin/payments-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_key: key, config_value: value }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error || 'Save failed');
          return false;
        }
        showToast('Saved — propagates within 60s');
        await fetchConfig();
        return true;
      } catch {
        setError('Network error');
        return false;
      }
    },
    [fetchConfig, showToast],
  );

  const globalRow = rows.find((r) => r.config_key === 'payments:global');
  const marketRows = rows.filter((r) => r.config_key.startsWith('payments:global:market:'));

  const globalConfig: PaymentsConfig = useMemo(() => {
    if (!globalRow) return DEFAULTS;
    const v = globalRow.config_value as Partial<PaymentsConfig>;
    return {
      addOnReserve: { ...DEFAULTS.addOnReserve, ...(v.addOnReserve ?? {}) },
      legacyFullFare: { ...DEFAULTS.legacyFullFare, ...(v.legacyFullFare ?? {}) },
      depositOnly: { ...DEFAULTS.depositOnly, ...(v.depositOnly ?? {}) },
    };
  }, [globalRow]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Payments Config</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Per-mode and per-market payment settings. Changes propagate within ~60s.
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
          <GlobalConfigEditor
            initial={globalConfig}
            updatedAt={globalRow?.updated_at}
            onSave={(v) => saveRow('payments:global', v)}
          />

          <PerMarketOverrideEditor
            globalConfig={globalConfig}
            marketRows={marketRows}
            onSave={(slug, v) => saveRow(`payments:global:market:${slug}`, v)}
          />
        </>
      )}
    </div>
  );
}

// ── Global config editor ───────────────────────────────────────────────────

function GlobalConfigEditor({
  initial,
  updatedAt,
  onSave,
}: {
  initial: PaymentsConfig;
  updatedAt?: string;
  onSave: (v: PaymentsConfig) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<PaymentsConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [testRidePrice, setTestRidePrice] = useState(20);
  const [testMenuTotal, setTestMenuTotal] = useState(10);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const legacyPreview = useMemo(
    () => previewLegacy(testRidePrice, testMenuTotal, draft),
    [testRidePrice, testMenuTotal, draft],
  );
  const depositPreview = useMemo(
    () => previewDepositOnly(testRidePrice, draft),
    [testRidePrice, draft],
  );

  const handleSave = async () => {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  };

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-2xl">
      <header className="flex items-baseline justify-between px-4 pt-4 pb-2 gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Global payment settings</h2>
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
              payments:global
            </span>
          </div>
          {updatedAt && (
            <p className="text-[11px] text-neutral-600 mt-1">
              Updated {new Date(updatedAt).toLocaleString()}
            </p>
          )}
        </div>
      </header>

      <div className="px-4 pb-4 space-y-8">
        {/* Add-on Reserve */}
        <Subsection
          title="Add-on reserve"
          subtitle="How much extra to pre-authorize at COO (pull-up) to cover driver menu items the rider might add. This is the root of the '$17 on a $10 ride' issue — tune it here."
        >
          <div className="space-y-4">
            <SelectRow
              label="Reserve mode"
              help="menu_total_capped: min(menuTotal, max(absoluteFloor, fare × percentFloor)). percent_of_fare: always fare × percentFloor. none: no reserve (each extra charged separately at driver approval)."
              value={draft.addOnReserve.mode}
              options={[
                { value: 'menu_total_capped', label: 'Menu total capped (current)' },
                { value: 'percent_of_fare', label: 'Percent of fare' },
                { value: 'none', label: 'No reserve (extras billed separately)' },
              ]}
              onChange={(v) => setDraft((d) => ({ ...d, addOnReserve: { ...d.addOnReserve, mode: v as AddOnReserveConfig['mode'] } }))}
            />
            {draft.addOnReserve.mode !== 'none' && (
              <>
                <NumberRow
                  label="Percent floor"
                  unit="%"
                  help="Reserve cap floor as % of ride price. For $10 ride at 25%: cap floor = $2.50. At 0%: cap = absoluteFloor always."
                  value={Math.round(draft.addOnReserve.percentFloor * 100)}
                  step={5}
                  min={0}
                  max={100}
                  onChange={(v) => setDraft((d) => ({ ...d, addOnReserve: { ...d.addOnReserve, percentFloor: v / 100 } }))}
                />
                {draft.addOnReserve.mode === 'menu_total_capped' && (
                  <NumberRow
                    label="Absolute floor"
                    unit="$"
                    help="The cap is never less than this, regardless of % floor. Current default is $50 — this is why a $10 ride gets a $7 reserve (menu < $50 cap). Set lower to reduce excess auth."
                    value={draft.addOnReserve.absoluteFloorDollars}
                    step={5}
                    min={0}
                    max={200}
                    onChange={(v) => setDraft((d) => ({ ...d, addOnReserve: { ...d.addOnReserve, absoluteFloorDollars: v } }))}
                  />
                )}
              </>
            )}
          </div>
        </Subsection>

        {/* Legacy Full Fare */}
        <Subsection
          title="Legacy full fare — visible deposit"
          subtitle="In this mode Stripe always authorizes the full fare + reserve. The visible deposit is only what the rider sees as their commitment. Actual capture at Start Ride = full ride."
        >
          <div className="space-y-4">
            <SelectRow
              label="Visible deposit mode"
              help="What amount to display to the rider as their 'deposit'. Does not affect Stripe auth amount."
              value={draft.legacyFullFare.visibleDepositMode}
              options={[
                { value: 'deposit_percent', label: '% of fare' },
                { value: 'deposit_fixed', label: 'Fixed amount' },
                { value: 'full', label: 'Full fare (no discount illusion)' },
              ]}
              onChange={(v) => setDraft((d) => ({ ...d, legacyFullFare: { ...d.legacyFullFare, visibleDepositMode: v as LegacyFullFareConfig['visibleDepositMode'] } }))}
            />
            {draft.legacyFullFare.visibleDepositMode === 'deposit_percent' && (
              <>
                <NumberRow
                  label="Deposit %"
                  unit="%"
                  help="Rider sees this fraction of the fare as their 'deposit'. E.g. 25% on a $20 ride shows $5."
                  value={Math.round(draft.legacyFullFare.visibleDepositPercent * 100)}
                  step={5}
                  min={5}
                  max={100}
                  onChange={(v) => setDraft((d) => ({ ...d, legacyFullFare: { ...d.legacyFullFare, visibleDepositPercent: v / 100 } }))}
                />
                <NumberRow
                  label="Deposit minimum"
                  unit="$"
                  help="Rider deposit never shows lower than this."
                  value={draft.legacyFullFare.visibleDepositMinimum}
                  step={1}
                  min={1}
                  max={50}
                  onChange={(v) => setDraft((d) => ({ ...d, legacyFullFare: { ...d.legacyFullFare, visibleDepositMinimum: v } }))}
                />
              </>
            )}
            {draft.legacyFullFare.visibleDepositMode === 'deposit_fixed' && (
              <NumberRow
                label="Fixed deposit amount"
                unit="$"
                help="Rider always sees this amount as their deposit."
                value={draft.legacyFullFare.visibleDepositFixed}
                step={1}
                min={1}
                max={100}
                onChange={(v) => setDraft((d) => ({ ...d, legacyFullFare: { ...d.legacyFullFare, visibleDepositFixed: v } }))}
              />
            )}
          </div>
        </Subsection>

        {/* Deposit Only */}
        <Subsection
          title="Deposit only — fee structure"
          subtitle="In this mode Stripe only authorizes the rider-selected deposit. Driver collects the cash remainder at pickup. Platform fee is taken from the deposit."
        >
          <div className="space-y-4">
            <NumberRow
              label="Platform fee"
              unit="%"
              help="Percentage of the deposit taken as platform fee. Applied on top of the floor."
              value={Math.round(draft.depositOnly.feePercent * 100)}
              step={1}
              min={0}
              max={50}
              onChange={(v) => setDraft((d) => ({ ...d, depositOnly: { ...d.depositOnly, feePercent: v / 100 } }))}
            />
            <NumberRow
              label="Fee floor"
              unit="¢"
              help="Minimum platform fee per ride in cents. Ensures HMU earns something on small deposits."
              value={draft.depositOnly.feeFloorCents}
              step={25}
              min={0}
              max={500}
              onChange={(v) => setDraft((d) => ({ ...d, depositOnly: { ...d.depositOnly, feeFloorCents: v } }))}
            />
            <NumberRow
              label="Extras fee"
              unit="%"
              help="Platform fee on each driver-confirmed add-on. Charged via Stripe at approval time."
              value={Math.round(draft.depositOnly.extrasFeePercent * 100)}
              step={1}
              min={0}
              max={50}
              onChange={(v) => setDraft((d) => ({ ...d, depositOnly: { ...d.depositOnly, extrasFeePercent: v / 100 } }))}
            />
            <NumberRow
              label="Deposit minimum"
              unit="$"
              help="Rider can never select a deposit lower than this."
              value={draft.depositOnly.depositMin}
              step={1}
              min={1}
              max={50}
              onChange={(v) => setDraft((d) => ({ ...d, depositOnly: { ...d.depositOnly, depositMin: v } }))}
            />
            <NumberRow
              label="Max deposit (% of fare)"
              unit="%"
              help="Rider can never select more than this fraction of the fare as deposit."
              value={Math.round(draft.depositOnly.depositMaxPctOfFare * 100)}
              step={5}
              min={5}
              max={100}
              onChange={(v) => setDraft((d) => ({ ...d, depositOnly: { ...d.depositOnly, depositMaxPctOfFare: v / 100 } }))}
            />
          </div>
        </Subsection>

        {/* Live preview */}
        <Subsection
          title="Revenue preview"
          subtitle="Live math for both modes at the test ride price. Slide to see revenue impact of your settings. Uses free-tier fee rate (10%). Deposit Only assumes rider picks 25% of fare."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <NumberRow
                label="Test ride price"
                unit="$"
                value={testRidePrice}
                step={5}
                min={5}
                max={150}
                onChange={setTestRidePrice}
              />
              <NumberRow
                label="Driver menu total"
                unit="$"
                help="Sum of all driver menu items (add-on reserve input)"
                value={testMenuTotal}
                step={5}
                min={0}
                max={100}
                onChange={setTestMenuTotal}
              />
            </div>
            <PreviewCard legacy={legacyPreview} deposit={depositPreview} ridePrice={testRidePrice} />
          </div>
        </Subsection>
      </div>

      <footer className="px-4 pb-4 pt-2 border-t border-neutral-800 flex items-center justify-between gap-2 bg-neutral-900 sticky bottom-0 rounded-b-2xl">
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
            {saving ? 'Saving…' : 'Save global config'}
          </button>
        </div>
      </footer>
    </section>
  );
}

// ── Revenue preview card ───────────────────────────────────────────────────

function PreviewCard({
  legacy,
  deposit,
  ridePrice,
}: {
  legacy: PreviewResult;
  deposit: PreviewResult;
  ridePrice: number;
}) {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const rows: { label: string; legacyVal: string; depositVal: string; highlight?: boolean }[] = [
    {
      label: 'Stripe auth',
      legacyVal: fmt(legacy.stripeAuth),
      depositVal: fmt(deposit.stripeAuth),
    },
    {
      label: 'Rider sees (deposit)',
      legacyVal: fmt(legacy.visibleDeposit),
      depositVal: fmt(deposit.visibleDeposit),
    },
    {
      label: 'Driver payout (Stripe)',
      legacyVal: fmt(legacy.driverPayout),
      depositVal: fmt(deposit.driverPayout),
    },
    ...(deposit.cashRemainder > 0
      ? [{ label: 'Driver cash remainder', legacyVal: '—', depositVal: fmt(deposit.cashRemainder) }]
      : []),
    {
      label: 'Platform fee (gross)',
      legacyVal: fmt(legacy.platformFee),
      depositVal: fmt(deposit.platformFee),
    },
    {
      label: 'Stripe processing',
      legacyVal: `−${fmt(legacy.stripeFee)}`,
      depositVal: `−${fmt(deposit.stripeFee)}`,
    },
    {
      label: 'Platform revenue (net)',
      legacyVal: fmt(legacy.platformNet),
      depositVal: fmt(deposit.platformNet),
      highlight: true,
    },
    {
      label: 'Effective HMU rate',
      legacyVal: pct(legacy.effectiveRate),
      depositVal: pct(deposit.effectiveRate),
    },
  ];

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-3 text-[10px] uppercase tracking-wider text-neutral-500 px-3 py-2 border-b border-neutral-800 bg-neutral-900/50">
        <div>Metric</div>
        <div className="text-center">Legacy Full Fare</div>
        <div className="text-center">Deposit Only</div>
      </div>
      <div className="text-xs text-[11px] text-neutral-300 px-3 py-2 bg-neutral-800/30 border-b border-neutral-800 font-mono">
        Test ride: ${ridePrice.toFixed(0)}
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className={`grid grid-cols-3 px-3 py-2 border-b border-neutral-900 last:border-0 ${
            r.highlight ? 'bg-emerald-500/5' : ''
          }`}
        >
          <div className={`text-[11px] ${r.highlight ? 'text-emerald-400 font-semibold' : 'text-neutral-400'}`}>
            {r.label}
          </div>
          <div
            className={`text-center font-mono text-[11px] tabular-nums ${
              r.highlight ? 'text-emerald-300 font-bold' : 'text-white'
            }`}
          >
            {r.legacyVal}
          </div>
          <div
            className={`text-center font-mono text-[11px] tabular-nums ${
              r.highlight ? 'text-emerald-300 font-bold' : 'text-white'
            }`}
          >
            {r.depositVal}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Per-market override editor ─────────────────────────────────────────────

function PerMarketOverrideEditor({
  globalConfig,
  marketRows,
  onSave,
}: {
  globalConfig: PaymentsConfig;
  marketRows: ConfigRow[];
  onSave: (slug: string, v: object) => Promise<boolean>;
}) {
  const [marketSlug, setMarketSlug] = useState(MARKETS[0].slug);
  const [draft, setDraft] = useState<PaymentsConfig>(globalConfig);
  const [saving, setSaving] = useState(false);

  const currentRow = marketRows.find((r) => r.config_key === `payments:global:market:${marketSlug}`);
  const hasOverride = !!currentRow;

  const initial: PaymentsConfig = useMemo(() => {
    if (!currentRow) return globalConfig;
    const v = currentRow.config_value as Partial<PaymentsConfig>;
    return {
      addOnReserve: { ...globalConfig.addOnReserve, ...(v.addOnReserve ?? {}) },
      legacyFullFare: { ...globalConfig.legacyFullFare, ...(v.legacyFullFare ?? {}) },
      depositOnly: { ...globalConfig.depositOnly, ...(v.depositOnly ?? {}) },
    };
  }, [currentRow, globalConfig]);

  useEffect(() => { setDraft(initial); }, [initial]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const handleSave = async () => {
    setSaving(true);
    // Persist only what differs from global so the DB row stays minimal
    const merged: Record<string, unknown> = {};
    if (JSON.stringify(draft.addOnReserve) !== JSON.stringify(globalConfig.addOnReserve)) {
      merged.addOnReserve = draft.addOnReserve;
    }
    if (JSON.stringify(draft.legacyFullFare) !== JSON.stringify(globalConfig.legacyFullFare)) {
      merged.legacyFullFare = draft.legacyFullFare;
    }
    if (JSON.stringify(draft.depositOnly) !== JSON.stringify(globalConfig.depositOnly)) {
      merged.depositOnly = draft.depositOnly;
    }
    await onSave(marketSlug, merged);
    setSaving(false);
  };

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-2xl">
      <header className="flex items-baseline justify-between px-4 pt-4 pb-2 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Per-market override</h2>
          <p className="text-[11px] text-neutral-500 mt-1 max-w-2xl">
            Markets inherit global settings. Changes here deep-merge over global for that market only.
          </p>
        </div>
        <select
          value={marketSlug}
          onChange={(e) => setMarketSlug(e.target.value)}
          className="bg-neutral-950 border border-neutral-800 rounded-md px-3 py-1.5 text-sm text-white"
        >
          {MARKETS.map((m) => (
            <option key={m.slug} value={m.slug}>{m.label} ({m.slug})</option>
          ))}
        </select>
      </header>

      <div className="px-4 pb-4 space-y-4">
        <div className={`text-[11px] px-3 py-2 rounded-lg ${
          hasOverride
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            : 'bg-neutral-800/50 text-neutral-400 border border-neutral-800'
        }`}>
          {hasOverride
            ? `${marketSlug.toUpperCase()} has a custom override. It deep-merges over global settings.`
            : `${marketSlug.toUpperCase()} inherits global settings. Adjust below and save to create an override.`}
        </div>

        <Subsection title="Add-on reserve">
          <div className="space-y-3">
            <SelectRow
              label="Reserve mode"
              value={draft.addOnReserve.mode}
              options={[
                { value: 'menu_total_capped', label: 'Menu total capped' },
                { value: 'percent_of_fare', label: 'Percent of fare' },
                { value: 'none', label: 'No reserve' },
              ]}
              onChange={(v) => setDraft((d) => ({ ...d, addOnReserve: { ...d.addOnReserve, mode: v as AddOnReserveConfig['mode'] } }))}
            />
            {draft.addOnReserve.mode !== 'none' && (
              <NumberRow
                label="Percent floor"
                unit="%"
                value={Math.round(draft.addOnReserve.percentFloor * 100)}
                step={5}
                min={0}
                max={100}
                onChange={(v) => setDraft((d) => ({ ...d, addOnReserve: { ...d.addOnReserve, percentFloor: v / 100 } }))}
              />
            )}
            {draft.addOnReserve.mode === 'menu_total_capped' && (
              <NumberRow
                label="Absolute floor"
                unit="$"
                value={draft.addOnReserve.absoluteFloorDollars}
                step={5}
                min={0}
                max={200}
                onChange={(v) => setDraft((d) => ({ ...d, addOnReserve: { ...d.addOnReserve, absoluteFloorDollars: v } }))}
              />
            )}
          </div>
        </Subsection>

        <Subsection title="Deposit only fee">
          <div className="space-y-3">
            <NumberRow
              label="Platform fee"
              unit="%"
              value={Math.round(draft.depositOnly.feePercent * 100)}
              step={1}
              min={0}
              max={50}
              onChange={(v) => setDraft((d) => ({ ...d, depositOnly: { ...d.depositOnly, feePercent: v / 100 } }))}
            />
            <NumberRow
              label="Fee floor"
              unit="¢"
              value={draft.depositOnly.feeFloorCents}
              step={25}
              min={0}
              max={500}
              onChange={(v) => setDraft((d) => ({ ...d, depositOnly: { ...d.depositOnly, feeFloorCents: v } }))}
            />
          </div>
        </Subsection>
      </div>

      <footer className="px-4 pb-4 pt-2 border-t border-neutral-800 flex items-center justify-between gap-2">
        <div className="text-[11px] text-neutral-500">
          {dirty ? 'Unsaved changes' : hasOverride ? 'Override in sync' : 'No override saved'}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setDraft(globalConfig)}
            className="text-xs text-neutral-500 hover:text-white px-3 py-1.5"
          >
            Reset to global
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="bg-white text-black hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-600 text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : hasOverride ? 'Update override' : 'Create override'}
          </button>
        </div>
      </footer>
    </section>
  );
}

// ── Reusable controls ──────────────────────────────────────────────────────

function Subsection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 pb-3 border-b border-neutral-800">
        <h3 className="text-xs uppercase tracking-wider text-white font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed max-w-2xl">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function NumberRow({
  label, help, unit, value, min, max, step, onChange,
}: {
  label: string; help?: string; unit?: string;
  value: number; min: number; max: number; step: number;
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
          >−</button>
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
          >+</button>
          {unit && <div className="text-xs text-neutral-500 w-6">{unit}</div>}
        </div>
      </div>
      {help && <div className="text-[11px] text-neutral-500 leading-snug mt-1">{help}</div>}
    </div>
  );
}

function SelectRow({
  label, help, value, options, onChange,
}: {
  label: string; help?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-neutral-200">{label}</div>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-neutral-950 border border-neutral-800 rounded-md px-2 py-1 text-sm text-white"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {help && <div className="text-[11px] text-neutral-500 leading-snug mt-1">{help}</div>}
    </div>
  );
}
