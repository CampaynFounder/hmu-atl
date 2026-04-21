'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatCard } from '../components/stat-card';
import { RevenueChart } from './revenue-chart';
import { TransactionLedger } from './transaction-ledger';
import { useMarket } from '../components/market-context';

interface Metrics {
  gmv: number;
  platformRevenue: number;
  feesWaived: number;
  stripeFees: number;
  profit: number;
  margin: number;
  driverPayouts: number;
  totalRides: number;
  failedCaptures: number;
  cashRides: number;
  cashGmv: number;
  refundsCount: number;
  refundsSum: number;
}

interface UnitEconomics {
  avgPrice: number;
  avgPlatformFee: number;
  avgStripeFee: number;
  avgDriverPayout: number;
  avgProfit: number;
  totalRides: number;
}

interface DailyRevenue {
  day: string;
  revenue: number;
  gmv: number;
  stripeFees: number;
  rides: number;
}

interface FeeTier {
  tier: string;
  rideCount: number;
  totalFees: number;
}

interface RevenueStreams {
  rideFares: number;
  addonRevenue: number;
  cashTotal: number;
  cashRides: number;
  digitalRides: number;
  hmuFirstSubscribers: number;
  hmuFirstMrr: number;
}

interface FeeAudit {
  totalExpectedFees: number;
  totalActualFees: number;
  totalVariance: number;
  expectedPct: number;
  actualPct: number;
  flaggedCount: number;
}

interface SubscriptionMetrics {
  active: number;
  mrr: number;
  newThisWeek: number;
  newThisMonth: number;
  churnedThisMonth: number;
}

interface AuditFlag {
  type: string;
  severity: string;
  rideId?: string;
  driverId?: string;
  amount?: number;
  message: string;
}

type Period = 'all' | 'monthly' | 'weekly' | 'daily';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function MoneyDashboard() {
  const [period, setPeriod] = useState<Period>('all');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [unitEconomics, setUnitEconomics] = useState<UnitEconomics | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [feeTiers, setFeeTiers] = useState<FeeTier[]>([]);
  const [revenueStreams, setRevenueStreams] = useState<RevenueStreams | null>(null);
  const [feeAudit, setFeeAudit] = useState<FeeAudit | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionMetrics | null>(null);
  const [auditFlags, setAuditFlags] = useState<AuditFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'ledger' | 'intelligence'>('overview');
  const { selectedMarketId } = useMarket();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const mq = selectedMarketId ? `&marketId=${selectedMarketId}` : '';
      const res = await fetch(`/api/admin/money?period=${period}${mq}`);
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setUnitEconomics(data.unitEconomics);
        setDailyRevenue(data.dailyRevenue);
        setFeeTiers(data.feeTiers);
        if (data.revenueStreams) setRevenueStreams(data.revenueStreams);
        if (data.feeAudit) setFeeAudit(data.feeAudit);
        // Fetch intelligence data in parallel
        const subUrl = selectedMarketId
          ? `/api/admin/money/subscriptions?marketId=${selectedMarketId}`
          : '/api/admin/money/subscriptions';
        Promise.all([
          fetch(subUrl).then(r => r.ok ? r.json() : null),
          fetch(`/api/admin/money/audit-flags?period=${period}${mq}`).then(r => r.ok ? r.json() : null),
        ]).then(([subs, flags]) => {
          if (subs) setSubscriptions(subs);
          if (flags?.flags) setAuditFlags(flags.flags);
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to fetch money data:', err);
    } finally {
      setLoading(false);
    }
  }, [period, selectedMarketId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Revenue</h1>
        <div className="flex gap-2">
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
            {(['overview', 'ledger', 'intelligence'] as const).map((t) => (
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
          {(tab === 'overview' || tab === 'intelligence') && (
            <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
              {(['all', 'monthly', 'weekly', 'daily'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    period === p ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  {p === 'all' ? 'All Time' : p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === 'intelligence' ? (
        <div className="space-y-6">
          {/* Revenue Streams */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <p className="text-[10px] text-neutral-500 tracking-wide mb-1">RIDE FARES</p>
              <p className="text-xl font-bold font-mono">{fmt(revenueStreams?.rideFares ?? 0)}</p>
              <p className="text-[10px] text-neutral-600">{revenueStreams?.digitalRides ?? 0} digital rides</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <p className="text-[10px] text-neutral-500 tracking-wide mb-1">ADD-ON EXTRAS</p>
              <p className="text-xl font-bold font-mono">{fmt(revenueStreams?.addonRevenue ?? 0)}</p>
              <p className="text-[10px] text-neutral-600">Menu items + in-ride</p>
            </div>
            <div className="bg-neutral-900 border border-blue-500/20 rounded-xl p-4">
              <p className="text-[10px] text-blue-400 tracking-wide mb-1">HMU FIRST</p>
              <p className="text-xl font-bold font-mono text-blue-400">MRR: {fmt(revenueStreams?.hmuFirstMrr ?? 0)}</p>
              <p className="text-[10px] text-neutral-600">{revenueStreams?.hmuFirstSubscribers ?? 0} subscribers</p>
              {subscriptions && (
                <p className="text-[10px] text-neutral-500 mt-1">
                  +{subscriptions.newThisWeek} this wk &middot; {subscriptions.churnedThisMonth} churned
                </p>
              )}
            </div>
            <div className="bg-neutral-900 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-[10px] text-yellow-400 tracking-wide mb-1">CASH RIDES</p>
              <p className="text-xl font-bold font-mono">{fmt(revenueStreams?.cashTotal ?? 0)}</p>
              <p className="text-[10px] text-neutral-600">{revenueStreams?.cashRides ?? 0} rides (unaudited)</p>
            </div>
          </div>

          {/* Expected vs Actual */}
          {feeAudit && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-4">Expected vs Actual Platform Fees</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-neutral-500">Expected Fees</p>
                  <p className="text-lg font-bold font-mono">{fmt(feeAudit.totalExpectedFees)}</p>
                  <p className="text-[10px] text-neutral-600">{feeAudit.expectedPct}% of GMV</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Actual Fees</p>
                  <p className="text-lg font-bold font-mono text-emerald-400">{fmt(feeAudit.totalActualFees)}</p>
                  <p className="text-[10px] text-neutral-600">{feeAudit.actualPct}% of GMV</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Variance</p>
                  <p className={`text-lg font-bold font-mono ${
                    feeAudit.totalVariance > 0.5 ? 'text-yellow-400' :
                    feeAudit.totalVariance < -0.5 ? 'text-red-400' :
                    'text-emerald-400'
                  }`}>
                    {feeAudit.totalVariance > 0 ? '+' : ''}{fmt(feeAudit.totalVariance)}
                  </p>
                  <p className="text-[10px] text-neutral-600">
                    {feeAudit.totalVariance > 0.5 ? 'Under-collected' :
                     feeAudit.totalVariance < -0.5 ? 'Over-collected' : 'On track'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Flagged Rides</p>
                  <p className={`text-lg font-bold ${feeAudit.flaggedCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {feeAudit.flaggedCount}
                  </p>
                  <p className="text-[10px] text-neutral-600">Variance &gt; $0.50</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Fee Rate Gap</p>
                  <p className={`text-lg font-bold font-mono ${
                    Math.abs(feeAudit.expectedPct - feeAudit.actualPct) > 1 ? 'text-yellow-400' : 'text-emerald-400'
                  }`}>
                    {feeAudit.expectedPct - feeAudit.actualPct > 0 ? '+' : ''}{(feeAudit.expectedPct - feeAudit.actualPct).toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-neutral-600">Expected {feeAudit.expectedPct}% vs actual {feeAudit.actualPct}%</p>
                </div>
              </div>
            </div>
          )}

          {/* HMU First Detail */}
          {subscriptions && (
            <div className="bg-neutral-900 border border-blue-500/20 rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-4 text-blue-400">HMU First Subscriptions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-neutral-500">Active</p>
                  <p className="text-lg font-bold">{subscriptions.active}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">MRR</p>
                  <p className="text-lg font-bold font-mono text-blue-400">{fmt(subscriptions.mrr)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">New This Week</p>
                  <p className="text-lg font-bold text-emerald-400">+{subscriptions.newThisWeek}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">New This Month</p>
                  <p className="text-lg font-bold text-emerald-400">+{subscriptions.newThisMonth}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Churned (30d)</p>
                  <p className={`text-lg font-bold ${subscriptions.churnedThisMonth > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {subscriptions.churnedThisMonth}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Audit Flags */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-4">Audit Flags</h2>
            {auditFlags.length === 0 ? (
              <p className="text-sm text-emerald-400 text-center py-4">No anomalies detected</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {auditFlags.map((flag, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 text-xs p-3 rounded-lg border ${
                      flag.severity === 'urgent' ? 'border-red-500/30 bg-red-500/5' :
                      flag.severity === 'warning' ? 'border-yellow-500/30 bg-yellow-500/5' :
                      'border-neutral-700'
                    }`}
                  >
                    <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                      flag.severity === 'urgent' ? 'bg-red-500' :
                      flag.severity === 'warning' ? 'bg-yellow-500' : 'bg-neutral-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white">{flag.message}</p>
                      <p className="text-neutral-600 mt-0.5">
                        {flag.type.replace(/_/g, ' ')}
                        {flag.amount ? ` · ${fmt(flag.amount)}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : tab === 'ledger' ? (
        <TransactionLedger />
      ) : loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
      ) : (
        <>
          {/* Profit Summary — hero card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-neutral-500 mb-1">GMV</p>
                <p className="text-xl font-bold font-mono">{fmt(metrics?.gmv ?? 0)}</p>
                <p className="text-[10px] text-neutral-600 mt-0.5">{metrics?.totalRides ?? 0} rides</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Platform Revenue</p>
                <p className="text-xl font-bold font-mono text-emerald-400">{fmt(metrics?.platformRevenue ?? 0)}</p>
                <p className="text-[10px] text-neutral-600 mt-0.5">Fees collected from rides</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Stripe Costs</p>
                <p className="text-xl font-bold font-mono text-red-400">-{fmt(metrics?.stripeFees ?? 0)}</p>
                <p className="text-[10px] text-neutral-600 mt-0.5">2.9% + $0.30 per txn</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Profit</p>
                <p className={`text-xl font-bold font-mono ${(metrics?.profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(metrics?.profit ?? 0)}
                </p>
                <p className="text-[10px] text-neutral-600 mt-0.5">{metrics?.margin ?? 0}% margin</p>
              </div>
            </div>
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Driver Payouts" value={fmt(metrics?.driverPayouts ?? 0)} color="blue" />
            <StatCard
              label="Cash Rides"
              value={metrics?.cashRides ?? 0}
              subtitle={fmt(metrics?.cashGmv ?? 0)}
              color="yellow"
            />
            <StatCard label="Fees Waived" value={fmt(metrics?.feesWaived ?? 0)} subtitle="Launch offers" color="yellow" />
            <StatCard
              label="Failed Captures"
              value={metrics?.failedCaptures ?? 0}
              color={metrics?.failedCaptures ? 'red' : 'white'}
            />
          </div>

          {/* Unit Economics */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-4">Per-Ride Unit Economics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <p className="text-xs text-neutral-500">Avg Price</p>
                <p className="text-lg font-bold font-mono">{fmt(unitEconomics?.avgPrice ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Avg Fee</p>
                <p className="text-lg font-bold font-mono text-emerald-400">{fmt(unitEconomics?.avgPlatformFee ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Avg Stripe</p>
                <p className="text-lg font-bold font-mono text-red-400">{fmt(unitEconomics?.avgStripeFee ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Avg Profit</p>
                <p className={`text-lg font-bold font-mono ${(unitEconomics?.avgProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmt(unitEconomics?.avgProfit ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500">Avg Payout</p>
                <p className="text-lg font-bold font-mono text-blue-400">{fmt(unitEconomics?.avgDriverPayout ?? 0)}</p>
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
