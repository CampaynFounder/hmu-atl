'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatCard } from '../components/stat-card';
import { RevenueChart } from './revenue-chart';
import { TransactionLedger } from './transaction-ledger';

interface Metrics {
  gmv: number;
  platformRevenue: number;
  feesWaived: number;
  stripeFees: number;
  netPlatformRevenue: number;
  driverPayouts: number;
  failedCaptures: number;
  refundsCount: number;
  refundsSum: number;
}

interface UnitEconomics {
  avgPrice: number;
  avgPlatformFee: number;
  avgStripeFee: number;
  avgDriverPayout: number;
  totalRides: number;
}

interface DailyRevenue {
  day: string;
  revenue: number;
  gmv: number;
  rides: number;
}

interface FeeTier {
  tier: string;
  rideCount: number;
  totalFees: number;
}

type Period = 'daily' | 'weekly' | 'monthly';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function MoneyDashboard() {
  const [period, setPeriod] = useState<Period>('daily');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [unitEconomics, setUnitEconomics] = useState<UnitEconomics | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [feeTiers, setFeeTiers] = useState<FeeTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'ledger'>('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/money?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setUnitEconomics(data.unitEconomics);
        setDailyRevenue(data.dailyRevenue);
        setFeeTiers(data.feeTiers);
      }
    } catch (err) {
      console.error('Failed to fetch money data:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Money Dashboard</h1>
        <div className="flex gap-2">
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            {(['overview', 'ledger'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  tab === t ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'overview' && (
            <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
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
          )}
        </div>
      </div>

      {tab === 'ledger' ? (
        <TransactionLedger />
      ) : loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <>
          {/* Main Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="GMV" value={fmt(metrics?.gmv ?? 0)} color="white" />
            <StatCard label="Platform Revenue" value={fmt(metrics?.platformRevenue ?? 0)} color="green" />
            <StatCard label="Stripe Fees" value={fmt(metrics?.stripeFees ?? 0)} color="red" />
            <StatCard
              label="Net Revenue"
              value={fmt(metrics?.netPlatformRevenue ?? 0)}
              color="green"
            />
            <StatCard label="Driver Payouts" value={fmt(metrics?.driverPayouts ?? 0)} color="blue" />
            <StatCard label="Fees Waived" value={fmt(metrics?.feesWaived ?? 0)} color="yellow" />
            <StatCard label="Failed Captures" value={metrics?.failedCaptures ?? 0} color="red" />
            <StatCard
              label="Refunds"
              value={metrics?.refundsCount ?? 0}
              subtitle={fmt(metrics?.refundsSum ?? 0)}
              color="red"
            />
          </div>

          {/* Unit Economics */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-4">Per-Ride Unit Economics</h2>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <p className="text-xs text-neutral-500">Avg Ride Price</p>
                <p className="text-lg font-bold">{fmt(unitEconomics?.avgPrice ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Avg Platform Fee</p>
                <p className="text-lg font-bold text-green-400">{fmt(unitEconomics?.avgPlatformFee ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Avg Stripe Fee</p>
                <p className="text-lg font-bold text-red-400">{fmt(unitEconomics?.avgStripeFee ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Avg Driver Payout</p>
                <p className="text-lg font-bold text-blue-400">{fmt(unitEconomics?.avgDriverPayout ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Total Rides</p>
                <p className="text-lg font-bold">{unitEconomics?.totalRides ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Chart */}
            <div className="lg:col-span-2">
              <RevenueChart data={dailyRevenue} />
            </div>

            {/* Fee Tier Distribution */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-4">Fee Tier Distribution</h2>
              {feeTiers.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-8">No data</p>
              ) : (
                <div className="space-y-3">
                  {feeTiers.map((tier) => {
                    const total = feeTiers.reduce((s, t) => s + t.rideCount, 0);
                    const pct = total > 0 ? (tier.rideCount / total) * 100 : 0;
                    return (
                      <div key={tier.tier}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-neutral-400 capitalize">{tier.tier === 'hmu_first' ? 'HMU First' : 'Free'}</span>
                          <span className="text-white">{tier.rideCount} rides ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${tier.tier === 'hmu_first' ? 'bg-blue-500' : 'bg-neutral-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-neutral-600 mt-0.5">Fees: {fmt(tier.totalFees)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
