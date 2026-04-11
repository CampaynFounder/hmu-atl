'use client';

import { useEffect, useState, useCallback } from 'react';
import { GrowthDrillInSheet } from '../components/growth-drill-in-sheet';

type DrillBucket = 'riders' | 'drivers' | 'active' | 'pending' | 'other';

interface GrowthBucket {
  bucket: string;
  riders: number;
  drivers: number;
  other: number;
  total: number;
}

interface Totals {
  total: number;
  riders: number;
  drivers: number;
  other: number;
  active: number;
  pending: number;
}

type Period = 'daily' | 'weekly' | 'monthly';

interface SummaryCardProps {
  label: string;
  value: number;
  valueColor: string;
  onClick: () => void;
  disabled: boolean;
}

function SummaryCard({ label, value, valueColor, onClick, disabled }: SummaryCardProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-left transition-colors ${
        disabled ? 'cursor-default opacity-70' : 'cursor-pointer hover:border-neutral-700'
      }`}
    >
      <p className="text-[10px] text-neutral-500 uppercase">{label}</p>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
      {!disabled && <p className="text-[9px] text-neutral-600 mt-0.5">click to view</p>}
    </button>
  );
}

export function UserGrowthChart() {
  const [period, setPeriod] = useState<Period>('daily');
  const [growth, setGrowth] = useState<GrowthBucket[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillBucket, setDrillBucket] = useState<DrillBucket | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/growth?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setGrowth(data.growth ?? []);
        setTotals(data.totals ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch growth data:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxTotal = Math.max(...growth.map((g) => g.total), 1);

  // Cumulative totals for the line
  let cumulative = 0;
  const cumulativeData = growth.map((g) => {
    cumulative += g.total;
    return cumulative;
  });
  const maxCumulative = Math.max(...cumulativeData, 1);

  const formatBucket = (bucket: string) => {
    if (period === 'monthly') {
      const [y, m] = bucket.split('-');
      return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1]} ${y.slice(2)}`;
    }
    const d = new Date(bucket + 'T00:00:00');
    if (period === 'weekly') {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards — clickable when count > 0, opens drill-in scoped to current period */}
      {totals && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
            <p className="text-[10px] text-neutral-500 uppercase">Total</p>
            <p className="text-xl font-bold text-white">{totals.total}</p>
          </div>
          <SummaryCard
            label="Riders"
            value={totals.riders}
            valueColor="text-green-400"
            onClick={() => setDrillBucket('riders')}
            disabled={totals.riders === 0}
          />
          <SummaryCard
            label="Drivers"
            value={totals.drivers}
            valueColor="text-blue-400"
            onClick={() => setDrillBucket('drivers')}
            disabled={totals.drivers === 0}
          />
          <SummaryCard
            label="Other"
            value={totals.other}
            valueColor="text-neutral-400"
            onClick={() => setDrillBucket('other')}
            disabled={totals.other === 0}
          />
          <SummaryCard
            label="Active"
            value={totals.active}
            valueColor="text-emerald-400"
            onClick={() => setDrillBucket('active')}
            disabled={totals.active === 0}
          />
          <SummaryCard
            label="Pending"
            value={totals.pending}
            valueColor="text-yellow-400"
            onClick={() => setDrillBucket('pending')}
            disabled={totals.pending === 0}
          />
        </div>
      )}

      {drillBucket && (
        <GrowthDrillInSheet
          open={drillBucket !== null}
          onClose={() => setDrillBucket(null)}
          bucket={drillBucket}
          period={period}
        />
      )}

      {/* Chart */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">User Growth</h3>
          <div className="flex bg-neutral-800 rounded-lg overflow-hidden">
            {(['daily', 'weekly', 'monthly'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  period === p ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-56 flex items-center justify-center">
            <p className="text-xs text-neutral-500">Loading...</p>
          </div>
        ) : growth.length === 0 ? (
          <div className="h-56 flex items-center justify-center">
            <p className="text-xs text-neutral-500">No data yet</p>
          </div>
        ) : (
          <>
            {/* Stacked bar chart */}
            <div className="flex items-end gap-1 h-56">
              {growth.map((g, i) => {
                const riderH = (g.riders / maxTotal) * 100;
                const driverH = (g.drivers / maxTotal) * 100;
                const otherH = (g.other / maxTotal) * 100;
                const showLabel = growth.length <= 14 || i % Math.ceil(growth.length / 10) === 0 || i === growth.length - 1;

                return (
                  <div key={i} className="flex-1 flex flex-col items-center group relative min-w-0">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 pointer-events-none">
                      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-xs whitespace-nowrap shadow-lg">
                        <p className="font-medium text-white">{formatBucket(g.bucket)}</p>
                        <p className="text-green-400">Riders: {g.riders}</p>
                        <p className="text-blue-400">Drivers: {g.drivers}</p>
                        {g.other > 0 && <p className="text-neutral-400">Other: {g.other}</p>}
                        <p className="text-white font-medium mt-0.5">Total: {g.total}</p>
                        <p className="text-neutral-500">Cumulative: {cumulativeData[i]}</p>
                      </div>
                    </div>

                    {/* Count label on top */}
                    {g.total > 0 && (
                      <span className="text-[9px] text-neutral-500 mb-0.5 hidden group-hover:block">
                        {g.total}
                      </span>
                    )}

                    {/* Stacked bars */}
                    <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                      {g.other > 0 && (
                        <div
                          className="w-full bg-neutral-500/60 rounded-t-sm transition-all"
                          style={{ height: `${otherH}%`, minHeight: '2px' }}
                        />
                      )}
                      {g.drivers > 0 && (
                        <div
                          className="w-full bg-blue-500/70 transition-all group-hover:bg-blue-500"
                          style={{ height: `${driverH}%`, minHeight: '2px' }}
                        />
                      )}
                      {g.riders > 0 && (
                        <div
                          className="w-full bg-green-500/70 rounded-t-sm transition-all group-hover:bg-green-500"
                          style={{ height: `${riderH}%`, minHeight: '2px' }}
                        />
                      )}
                    </div>

                    {/* Date label */}
                    {showLabel && (
                      <span className="text-[8px] text-neutral-600 mt-1 -rotate-45 origin-left whitespace-nowrap">
                        {formatBucket(g.bucket)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cumulative line overlay */}
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-neutral-500">
                <span>Cumulative</span>
                <span>{cumulativeData[cumulativeData.length - 1]} total users</span>
              </div>
              <div className="h-8 flex items-end gap-px mt-1">
                {cumulativeData.map((c, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-white/10 rounded-t-sm"
                    style={{ height: `${(c / maxCumulative) * 100}%`, minHeight: '1px' }}
                  />
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 mt-4 justify-center">
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <span className="w-3 h-2 bg-green-500/70 rounded-sm" />
                Riders
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <span className="w-3 h-2 bg-blue-500/70 rounded-sm" />
                Drivers
              </div>
              {(totals?.other ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                  <span className="w-3 h-2 bg-neutral-500/60 rounded-sm" />
                  Other
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                <span className="w-3 h-2 bg-white/10 rounded-sm" />
                Cumulative
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
