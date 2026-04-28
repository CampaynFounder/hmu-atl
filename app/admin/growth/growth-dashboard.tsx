'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMarket } from '../components/market-context';
import { SignupCharts, type SignupSeries } from './sections/signup-charts';
import { TargetsPanel, type DecoratedTarget } from './sections/targets-panel';
import { AreaDistribution, type AreaRow } from './sections/area-distribution';

type Range = '7d' | '30d' | '90d';

interface SignupResponse {
  range: Range;
  series: SignupSeries;
  totalsInRange: { riders: number; drivers: number };
  weekOverWeek: {
    riders: { last: number; prev: number; pct: number };
    drivers: { last: number; prev: number; pct: number };
  };
  allTime: { riders: number; drivers: number };
}

export function GrowthDashboard() {
  const { selectedMarketId, selectedMarket } = useMarket();
  const [range, setRange] = useState<Range>('30d');
  const [layout, setLayout] = useState<'side' | 'stacked'>('side');
  const [signups, setSignups] = useState<SignupResponse | null>(null);
  const [targets, setTargets] = useState<DecoratedTarget[]>([]);
  const [areas, setAreas] = useState<{ totalDrivers: number; areas: AreaRow[]; gapsCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const mq = selectedMarketId ? `&marketId=${selectedMarketId}` : '';
    try {
      const [s, t, a] = await Promise.all([
        fetch(`/api/admin/growth/signups?range=${range}${mq}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/admin/growth/targets`).then(r => r.ok ? r.json() : null),
        selectedMarketId
          ? fetch(`/api/admin/growth/areas?marketId=${selectedMarketId}`).then(r => r.ok ? r.json() : null)
          : Promise.resolve(null),
      ]);
      if (s) setSignups(s);
      if (t?.targets) setTargets(t.targets);
      if (a) setAreas(a);
      else setAreas(null);
    } finally {
      setLoading(false);
    }
  }, [range, selectedMarketId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Growth</h1>
          <p className="text-xs text-neutral-500 mt-1">
            {selectedMarket ? `Market: ${selectedMarket.name}` : 'All markets'} · {loading ? 'Loading…' : 'Live'}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            {(['7d', '30d', '90d'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === r ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            {(['side', 'stacked'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  layout === l ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'
                }`}
              >
                {l === 'side' ? 'Side-by-side' : 'Stacked'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SignupCharts
        loading={loading && !signups}
        layout={layout}
        range={range}
        series={signups?.series ?? []}
        totalsInRange={signups?.totalsInRange ?? { riders: 0, drivers: 0 }}
        weekOverWeek={signups?.weekOverWeek ?? { riders: { last: 0, prev: 0, pct: 0 }, drivers: { last: 0, prev: 0, pct: 0 } }}
        allTime={signups?.allTime ?? { riders: 0, drivers: 0 }}
      />

      <TargetsPanel
        loading={loading && targets.length === 0}
        targets={targets}
        markets={selectedMarket ? [selectedMarket] : []}
        defaultMarketId={selectedMarketId}
        onChange={fetchAll}
      />

      <AreaDistribution
        loading={loading && !areas}
        marketName={selectedMarket?.name ?? null}
        totalDrivers={areas?.totalDrivers ?? 0}
        areas={areas?.areas ?? []}
        gapsCount={areas?.gapsCount ?? 0}
        marketSelected={!!selectedMarketId}
      />
    </div>
  );
}
