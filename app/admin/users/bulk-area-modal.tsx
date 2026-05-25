'use client';

import { useEffect, useMemo, useState } from 'react';

type Cardinal = 'central' | 'northside' | 'eastside' | 'southside' | 'westside';

interface Area {
  slug: string;
  name: string;
  cardinal: Cardinal;
}

interface Props {
  marketId: string;
  selectedCount: number;
  onClose: () => void;
  onApply: (params: { areaSlugs: string[]; servicesEntireMarket: boolean }) => Promise<void>;
}

const CARDINAL_ORDER: Cardinal[] = ['central', 'northside', 'eastside', 'southside', 'westside'];
const CARDINAL_LABEL: Record<Cardinal, string> = {
  central: 'Central',
  northside: 'Northside',
  eastside: 'Eastside',
  southside: 'Southside',
  westside: 'Westside',
};

export function BulkAreaModal({ marketId, selectedCount, onClose, onApply }: Props) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servicesEntireMarket, setServicesEntireMarket] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/markets/${marketId}/areas`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load areas');
        if (!cancelled) setAreas(data.areas as Area[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load areas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [marketId]);

  const grouped = useMemo(() => {
    const out = new Map<Cardinal, Area[]>();
    for (const c of CARDINAL_ORDER) out.set(c, []);
    for (const a of areas) out.get(a.cardinal)?.push(a);
    return out;
  }, [areas]);

  function toggle(slug: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function handleApply() {
    setSaving(true);
    setError(null);
    try {
      await onApply({
        areaSlugs: servicesEntireMarket ? [] : Array.from(picked),
        servicesEntireMarket,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-950 p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Set ride areas</h2>
          <p className="text-xs text-neutral-400">
            Replaces the area list for {selectedCount} selected driver{selectedCount === 1 ? '' : 's'}.
            Drivers outside the currently-selected market are skipped.
          </p>
        </header>

        {error && (
          <div className="rounded border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>
        )}

        <label className="flex items-center gap-2 text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={servicesEntireMarket}
            onChange={(e) => setServicesEntireMarket(e.target.checked)}
          />
          Service entire market <span className="text-neutral-500">(no specific areas required)</span>
        </label>

        {!servicesEntireMarket && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-sm text-neutral-400">Loading areas…</div>
            ) : areas.length === 0 ? (
              <div className="text-sm text-neutral-400">No areas configured for this market.</div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <div className="text-neutral-400">{picked.size} selected</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPicked(new Set(areas.map((a) => a.slug)))}
                      className="text-blue-400 hover:underline"
                    >
                      Select all
                    </button>
                    <span className="text-neutral-600">·</span>
                    <button
                      onClick={() => setPicked(new Set())}
                      className="text-blue-400 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {CARDINAL_ORDER.map((c) => {
                  const list = grouped.get(c) ?? [];
                  if (list.length === 0) return null;
                  return (
                    <div key={c} className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        {CARDINAL_LABEL[c]}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {list.map((a) => {
                          const on = picked.has(a.slug);
                          return (
                            <button
                              key={a.slug}
                              onClick={() => toggle(a.slug)}
                              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                                on
                                  ? 'bg-emerald-700 border-emerald-700 text-white'
                                  : 'border-neutral-700 text-neutral-300 hover:bg-neutral-900'
                              }`}
                            >
                              {a.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-900 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={saving || (!servicesEntireMarket && picked.size === 0)}
            className="rounded bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? 'Applying…' : `Apply to ${selectedCount} driver${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
