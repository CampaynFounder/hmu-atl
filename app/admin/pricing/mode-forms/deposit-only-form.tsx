'use client';

import { useEffect, useState } from 'react';

export interface DepositOnlyConfig {
  feeFloorCents: number;
  feePercent: number;
  depositMin: number;
  depositIncrement: number;
  depositMaxPctOfFare: number;
  noShowDriverPct: number;
  depositRule: 'rider_select' | 'distance_band' | 'percent_of_fare';
}

interface Props {
  initial: Record<string, unknown>;
  saving: boolean;
  onSave: (config: DepositOnlyConfig) => void;
}

type FieldErrors = Partial<Record<keyof DepositOnlyConfig, string>>;

const DEPOSIT_RULES: DepositOnlyConfig['depositRule'][] = [
  'rider_select',
  'distance_band',
  'percent_of_fare',
];

function coerceNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function coerceRule(v: unknown): DepositOnlyConfig['depositRule'] {
  return DEPOSIT_RULES.includes(v as DepositOnlyConfig['depositRule'])
    ? (v as DepositOnlyConfig['depositRule'])
    : 'rider_select';
}

function validate(form: {
  feeFloorDollars: string;
  feePercentDisplay: string;
  depositMin: string;
  depositIncrement: string;
  depositMaxPctDisplay: string;
  noShowDriverPctDisplay: string;
  depositRule: string;
}): { errors: FieldErrors; parsed?: DepositOnlyConfig } {
  const errors: FieldErrors = {};

  const feeFloorDollars = Number(form.feeFloorDollars);
  if (!form.feeFloorDollars.trim()) errors.feeFloorCents = 'Required';
  else if (!Number.isFinite(feeFloorDollars) || feeFloorDollars < 0 || feeFloorDollars > 1000)
    errors.feeFloorCents = 'Must be between $0 and $1000';

  const feePercent = Number(form.feePercentDisplay) / 100;
  if (!form.feePercentDisplay.trim()) errors.feePercent = 'Required';
  else if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 1)
    errors.feePercent = 'Must be between 0 and 100%';

  const depositMin = Number(form.depositMin);
  if (!form.depositMin.trim()) errors.depositMin = 'Required';
  else if (!Number.isFinite(depositMin) || depositMin <= 0 || depositMin > 1000)
    errors.depositMin = 'Must be between $0.01 and $1000';

  const depositIncrement = Number(form.depositIncrement);
  if (!form.depositIncrement.trim()) errors.depositIncrement = 'Required';
  else if (!Number.isFinite(depositIncrement) || depositIncrement <= 0 || depositIncrement > 100)
    errors.depositIncrement = 'Must be between $0.01 and $100';

  const depositMaxPctOfFare = Number(form.depositMaxPctDisplay) / 100;
  if (!form.depositMaxPctDisplay.trim()) errors.depositMaxPctOfFare = 'Required';
  else if (!Number.isFinite(depositMaxPctOfFare) || depositMaxPctOfFare <= 0 || depositMaxPctOfFare > 1)
    errors.depositMaxPctOfFare = 'Must be between 0 and 100%';

  const noShowDriverPct = Number(form.noShowDriverPctDisplay) / 100;
  if (!form.noShowDriverPctDisplay.trim()) errors.noShowDriverPct = 'Required';
  else if (!Number.isFinite(noShowDriverPct) || noShowDriverPct < 0 || noShowDriverPct > 1)
    errors.noShowDriverPct = 'Must be between 0 and 100%';

  if (!DEPOSIT_RULES.includes(form.depositRule as DepositOnlyConfig['depositRule']))
    errors.depositRule = 'Invalid rule';

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    parsed: {
      feeFloorCents: Math.round(feeFloorDollars * 100),
      feePercent,
      depositMin,
      depositIncrement,
      depositMaxPctOfFare,
      noShowDriverPct,
      depositRule: form.depositRule as DepositOnlyConfig['depositRule'],
    },
  };
}

export default function DepositOnlyForm({ initial, saving, onSave }: Props) {
  const [feeFloorDollars, setFeeFloorDollars] = useState('');
  const [feePercentDisplay, setFeePercentDisplay] = useState('');
  const [depositMin, setDepositMin] = useState('');
  const [depositIncrement, setDepositIncrement] = useState('');
  const [depositMaxPctDisplay, setDepositMaxPctDisplay] = useState('');
  const [noShowDriverPctDisplay, setNoShowDriverPctDisplay] = useState('');
  const [depositRule, setDepositRule] = useState<DepositOnlyConfig['depositRule']>('rider_select');
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    const cents = coerceNumber(initial.feeFloorCents, 150);
    setFeeFloorDollars((cents / 100).toFixed(2));
    setFeePercentDisplay((coerceNumber(initial.feePercent, 0.2) * 100).toString());
    setDepositMin(coerceNumber(initial.depositMin, 5).toString());
    setDepositIncrement(coerceNumber(initial.depositIncrement, 1).toString());
    setDepositMaxPctDisplay((coerceNumber(initial.depositMaxPctOfFare, 0.5) * 100).toString());
    setNoShowDriverPctDisplay((coerceNumber(initial.noShowDriverPct, 1.0) * 100).toString());
    setDepositRule(coerceRule(initial.depositRule));
  }, [initial]);

  function handleSave() {
    const result = validate({
      feeFloorDollars,
      feePercentDisplay,
      depositMin,
      depositIncrement,
      depositMaxPctDisplay,
      noShowDriverPctDisplay,
      depositRule,
    });
    setErrors(result.errors);
    if (result.parsed) onSave(result.parsed);
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-[11px] text-neutral-400">
        <div className="font-mono text-neutral-300">Platform fee = max(floor, percent × deposit)</div>
        <div className="mt-1">All fields required. Defaults exist in code as a safety net but admin values are the source of truth.</div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Platform fee floor"
          unit="$"
          value={feeFloorDollars}
          onChange={setFeeFloorDollars}
          step="0.01"
          help="Minimum platform fee per ride, in dollars."
          error={errors.feeFloorCents}
        />
        <Field
          label="Platform fee percent"
          unit="%"
          value={feePercentDisplay}
          onChange={setFeePercentDisplay}
          step="0.1"
          help="Percent of deposit taken as platform fee."
          error={errors.feePercent}
        />
        <Field
          label="Minimum deposit"
          unit="$"
          value={depositMin}
          onChange={setDepositMin}
          step="0.01"
          help="Smallest deposit a rider can authorize."
          error={errors.depositMin}
        />
        <Field
          label="Deposit increment"
          unit="$"
          value={depositIncrement}
          onChange={setDepositIncrement}
          step="0.01"
          help="Deposit amount must round to multiples of this."
          error={errors.depositIncrement}
        />
        <Field
          label="Max deposit (% of fare)"
          unit="%"
          value={depositMaxPctDisplay}
          onChange={setDepositMaxPctDisplay}
          step="1"
          help="Cap on how much of the total fare can be authorized as deposit."
          error={errors.depositMaxPctOfFare}
        />
        <Field
          label="Driver share on no-show"
          unit="%"
          value={noShowDriverPctDisplay}
          onChange={setNoShowDriverPctDisplay}
          step="1"
          help="Share of deposit driver keeps on no-show (minus platform fee)."
          error={errors.noShowDriverPct}
        />
        <div className="space-y-1 sm:col-span-2">
          <label className="block text-xs text-neutral-300">Deposit rule</label>
          <select
            value={depositRule}
            onChange={(e) => setDepositRule(e.target.value as DepositOnlyConfig['depositRule'])}
            className="w-full rounded border border-neutral-800 bg-neutral-950 p-2 text-sm"
          >
            <option value="rider_select">rider_select — rider chooses deposit per ride</option>
            <option value="distance_band">distance_band — band-based deposit (future)</option>
            <option value="percent_of_fare">percent_of_fare — fixed % of fare (future)</option>
          </select>
          {errors.depositRule && <div className="text-xs text-red-400">{errors.depositRule}</div>}
          <div className="text-[11px] text-neutral-500">Currently only <span className="font-mono">rider_select</span> is implemented in code.</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={saving}
          onClick={handleSave}
          className="rounded bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save config'}
        </button>
        {hasErrors && <div className="text-xs text-red-400">Fix the highlighted fields before saving.</div>}
      </div>
    </div>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  step,
  help,
  error,
}: {
  label: string;
  unit: '$' | '%';
  value: string;
  onChange: (v: string) => void;
  step: string;
  help: string;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs text-neutral-300">{label}</label>
      <div className={`flex items-center rounded border bg-neutral-950 ${error ? 'border-red-700' : 'border-neutral-800'}`}>
        {unit === '$' && <span className="px-2 text-xs text-neutral-500">$</span>}
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent p-2 text-sm outline-none"
        />
        {unit === '%' && <span className="px-2 text-xs text-neutral-500">%</span>}
      </div>
      {error ? (
        <div className="text-xs text-red-400">{error}</div>
      ) : (
        <div className="text-[11px] text-neutral-500">{help}</div>
      )}
    </div>
  );
}
