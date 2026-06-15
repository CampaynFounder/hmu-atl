'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMarket } from '../components/market-context';

// ── Types ────────────────────────────────────────────────────────────────────

interface BookingFlags {
  direct: boolean;
  blast: boolean;
  downBad: boolean;
  delivery: boolean;
}

type BookingType = keyof BookingFlags;

// Order + copy mirror the rider home cards (app/(rider)/home.tsx BOOKING_MODES).
const BOOKING_TYPES: { key: BookingType; label: string; desc: string }[] = [
  { key: 'direct',   label: 'Direct',   desc: 'Book a specific driver by handle. They get 15 min to accept.' },
  { key: 'blast',    label: 'Blast',    desc: 'Set your price. Drivers in your area HMU. Pick the best offer.' },
  { key: 'downBad',  label: 'Down Bad', desc: 'Urgent pickup. Cash offer. First driver to pull up gets the job.' },
  { key: 'delivery', label: 'Delivery', desc: 'Tell us what you need. A courier buys it and brings it to you.' },
];

const DEFAULT_FLAGS: BookingFlags = { direct: false, blast: false, downBad: false, delivery: false };

// ── Main component ─────────────────────────────────────────────────────────────

export default function BookingTypesClient() {
  const { markets, selectedMarketId, selectedMarket, setSelectedMarketId, loading: marketsLoading } = useMarket();

  const [flags, setFlags] = useState<BookingFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<BookingType | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const fetchFlags = useCallback(async (marketId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/booking-types?marketId=${encodeURIComponent(marketId)}`);
      if (!res.ok) { setError('Failed to load booking types'); return; }
      const data = await res.json();
      setFlags({ ...DEFAULT_FLAGS, ...(data.flags as Partial<BookingFlags>) });
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMarketId) void fetchFlags(selectedMarketId);
  }, [selectedMarketId, fetchFlags]);

  // Toggle = one PATCH per column. Optimistic with rollback on failure.
  const toggle = useCallback(async (type: BookingType, next: boolean) => {
    if (!selectedMarketId) return;
    setSaving(type);
    setError(null);
    setFlags((f) => ({ ...f, [type]: next }));
    try {
      const res = await fetch('/api/admin/booking-types', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId: selectedMarketId, type, enabled: next }),
      });
      if (res.ok) {
        showToast(`${labelFor(type)} ${next ? 'enabled' : 'disabled'}`);
      } else {
        const b = await res.json().catch(() => ({}));
        setError(b.error || 'Save failed');
        setFlags((f) => ({ ...f, [type]: !next })); // rollback
      }
    } catch {
      setError('Network error');
      setFlags((f) => ({ ...f, [type]: !next })); // rollback
    } finally {
      setSaving(null);
    }
  }, [selectedMarketId]);

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Booking Types</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Roll booking flows out market-by-market. When a type is OFF, riders see it as
          “Coming soon”, the booking API rejects it, and drivers stop seeing those requests.
        </p>
      </div>

      {/* Market selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Market</label>
        <select
          value={selectedMarketId ?? ''}
          onChange={(e) => setSelectedMarketId(e.target.value || null)}
          disabled={marketsLoading || !markets.length}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-600"
        >
          {markets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} {m.status === 'live' ? '' : `(${m.status})`}
            </option>
          ))}
        </select>
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

      {marketsLoading || loading ? (
        <div className="text-neutral-500 text-sm">Loading…</div>
      ) : !selectedMarket ? (
        <div className="text-neutral-500 text-sm">No market selected.</div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-6">
          <div className="text-sm font-semibold text-white">
            {selectedMarket.name} — booking flows
          </div>
          {BOOKING_TYPES.map((t, i) => (
            <div key={t.key}>
              {i > 0 && <div className="border-t border-neutral-800 mb-6" />}
              <ToggleRow
                label={t.label}
                help={t.desc}
                value={flags[t.key]}
                disabled={saving === t.key}
                onChange={(v) => void toggle(t.key, v)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function labelFor(type: BookingType): string {
  return BOOKING_TYPES.find((t) => t.key === type)?.label ?? type;
}

// ── Sub-components (mirrors app/admin/down-bad/down-bad-config-client.tsx) ──────

function ToggleRow({
  label, help, value, disabled, onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <div className="text-sm text-neutral-200">{label}</div>
        {help && <div className="text-[11px] text-neutral-500 leading-snug mt-1">{help}</div>}
      </div>
      <Switch checked={value} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:opacity-40 ${
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
