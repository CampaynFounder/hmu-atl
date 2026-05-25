'use client';

import { useEffect, useState, useCallback } from 'react';

interface DirectBookingConfig {
  expiry_minutes: number;
}

const PRESETS = [2, 3, 5, 10, 15, 20, 30];

export default function DirectBookingConfigClient() {
  const [config, setConfig] = useState<DirectBookingConfig | null>(null);
  const [draft, setDraft] = useState<number>(15);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/direct-booking-config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setDraft(data.config.expiry_minutes);
        setUpdatedAt(data.updatedAt);
      } else {
        setError('Failed to load config');
      }
    } catch {
      setError('Network error');
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/direct-booking-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiry_minutes: draft }),
      });
      if (res.ok) {
        await fetchConfig();
        setToast(`Saved — drivers now have ${draft} min to respond`);
        window.setTimeout(() => setToast(null), 3000);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Save failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }, [draft, fetchConfig]);

  const isDirty = config !== null && draft !== config.expiry_minutes;

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h1 className="text-xl font-bold">Direct Booking Config</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Controls the direct booking flow — timers and acceptance windows.
        </p>
        {updatedAt && (
          <p className="text-[11px] text-neutral-600 mt-1">
            Last saved {new Date(updatedAt).toLocaleString()}
          </p>
        )}
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

      {config === null ? (
        <div className="text-neutral-500 text-sm">Loading…</div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-sm font-semibold text-white">
                Driver response window
              </label>
              <span className="text-2xl font-bold text-white tabular-nums">
                {draft} <span className="text-sm font-normal text-neutral-400">min</span>
              </span>
            </div>
            <p className="text-xs text-neutral-500 mb-4">
              How long a driver has to accept or decline a direct booking request before it expires.
              Rider sees a live countdown; SMS to driver shows this number.
            </p>

            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={draft}
              onChange={(e) => setDraft(Number(e.target.value))}
              className="w-full accent-white"
            />
            <div className="flex justify-between text-[10px] text-neutral-600 mt-1">
              <span>1 min</span>
              <span>30 min</span>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setDraft(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    draft === p
                      ? 'bg-white text-black'
                      : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  {p} min
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-neutral-800">
            <button
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="bg-white text-black text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-200 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {isDirty && (
              <button
                onClick={() => setDraft(config.expiry_minutes)}
                className="text-xs text-neutral-500 hover:text-white transition-colors"
              >
                Reset
              </button>
            )}
            {!isDirty && config && (
              <span className="text-xs text-neutral-600">
                Currently {config.expiry_minutes} min — no changes
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
