'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { StatCard } from '../components/stat-card';
import { RevenueChart } from './revenue-chart';
import { TransactionLedger } from './transaction-ledger';
import { useMarket } from '../components/market-context';

// ── Interfaces ────────────────────────────────────────────────────────────────

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
  captureShortfalls: { count: number; total: number };
  cancelRevenue: number;
  extrasRevenue: number;
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

interface ShortfallRide {
  rideId: string;
  refCode: string | null;
  rideStatus: string;
  amount: number;
  description: string;
  driverName: string;
  driverHandle: string | null;
  riderHandle: string | null;
  createdAt: string;
}

interface StreamEntry {
  id: string;
  rideId: string | null;
  refCode: string | null;
  eventType: string;
  amount: number;
  direction: string;
  description: string;
  driverName: string | null;
  riderHandle: string | null;
  createdAt: string;
}

type Period = 'all' | 'monthly' | 'weekly' | 'daily';
type StreamType = 'rides' | 'extras' | 'deposits' | 'shortfalls';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = fromRef.current;
    const startTime = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setVal(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return val;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
function fmtShort(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fade(visible: boolean, delay = 0) {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0px)' : 'translateY(10px)',
    transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
  };
}

// ── Animated hero value ───────────────────────────────────────────────────────

function AnimatedCurrency({ value, className }: { value: number; className?: string }) {
  const animated = useCountUp(value);
  return <span className={className}>{fmt(animated)}</span>;
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const animated = useCountUp(value);
  return <span className={className}>{Math.round(animated).toLocaleString()}</span>;
}

function AnimatedPct({ value, className }: { value: number; className?: string }) {
  const animated = useCountUp(value);
  return <span className={className}>{animated.toFixed(1)}%</span>;
}

// ── Slide-over panel ──────────────────────────────────────────────────────────

function SlideOver({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50"
      style={{ pointerEvents: open ? 'auto' : 'none' }}
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
      />
      {/* panel */}
      <div
        className="absolute right-0 top-0 h-full w-full max-w-lg bg-neutral-950 border-l border-neutral-800 flex flex-col transition-transform duration-300 ease-out"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Revenue stream bar ────────────────────────────────────────────────────────

const STREAM_META: Record<StreamType, { label: string; color: string; barColor: string; desc: string }> = {
  rides: { label: 'Ride Platform Fees', color: 'text-emerald-400', barColor: 'bg-emerald-500', desc: 'HMU cut from completed rides' },
  extras: { label: 'Add-On Extras', color: 'text-purple-400', barColor: 'bg-purple-500', desc: 'Per-extra platform fee (deposit mode)' },
  deposits: { label: 'Cancel Deposits', color: 'text-orange-400', barColor: 'bg-orange-500', desc: 'Platform cut from cancellation fees' },
  shortfalls: { label: 'Capture Shortfalls', color: 'text-red-400', barColor: 'bg-red-500', desc: 'Add-ons capped at authorized reserve' },
};

function RevenueStreamRow({
  type,
  amount,
  total,
  visible,
  delay,
  period,
  onDrillIn,
}: {
  type: StreamType;
  amount: number;
  total: number;
  visible: boolean;
  delay: number;
  period: Period;
  onDrillIn: (type: StreamType) => void;
}) {
  const meta = STREAM_META[type];
  const pct = total > 0 ? (amount / total) * 100 : 0;
  const [barReady, setBarReady] = useState(false);
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setBarReady(true), delay + 200);
      return () => clearTimeout(t);
    }
  }, [visible, delay]);

  return (
    <button
      onClick={() => onDrillIn(type)}
      className="w-full text-left group"
      style={fade(visible, delay)}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
          <span className="text-[10px] text-neutral-600 hidden sm:inline">{meta.desc}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono font-semibold ${meta.color}`}>{fmtShort(amount)}</span>
          <span className="text-[10px] text-neutral-600">({pct.toFixed(1)}%)</span>
          <span className="text-neutral-600 text-xs group-hover:text-neutral-400 transition-colors">›</span>
        </div>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${meta.barColor} rounded-full transition-all duration-700 ease-out`}
          style={{ width: barReady ? `${Math.max(pct, amount > 0 ? 1 : 0)}%` : '0%' }}
        />
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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

  // Fade-in state — triggers once data arrives
  const [visible, setVisible] = useState(false);

  // Drill-in sheets
  const [shortfallsOpen, setShortfallsOpen] = useState(false);
  const [shortfallsData, setShortfallsData] = useState<ShortfallRide[]>([]);
  const [shortfallsLoading, setShortfallsLoading] = useState(false);
  const [streamOpen, setStreamOpen] = useState<StreamType | null>(null);
  const [streamData, setStreamData] = useState<StreamEntry[]>([]);
  const [streamLoading, setStreamLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setVisible(false);
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
        const subUrl = selectedMarketId
          ? `/api/admin/money/subscriptions?marketId=${selectedMarketId}`
          : '/api/admin/money/subscriptions';
        Promise.all([
          fetch(subUrl).then((r) => r.ok ? r.json() : null),
          fetch(`/api/admin/money/audit-flags?period=${period}${mq}`).then((r) => r.ok ? r.json() : null),
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

  useEffect(() => { fetchData(); }, [fetchData]);

  // Trigger stagger animation once data has loaded
  useEffect(() => {
    if (!loading && metrics) {
      const t = setTimeout(() => setVisible(true), 60);
      return () => clearTimeout(t);
    }
  }, [loading, metrics]);

  // Fetch shortfall ride details when panel opens
  const openShortfalls = useCallback(async () => {
    setShortfallsOpen(true);
    if (shortfallsData.length > 0) return;
    setShortfallsLoading(true);
    try {
      const res = await fetch('/api/admin/money/shortfalls');
      if (res.ok) {
        const data = await res.json();
        setShortfallsData(data.shortfalls ?? []);
      }
    } catch { /* non-critical */ } finally {
      setShortfallsLoading(false);
    }
  }, [shortfallsData.length]);

  // Fetch stream entries when drill-in panel opens
  const openStream = useCallback(async (type: StreamType) => {
    setStreamOpen(type);
    setStreamData([]);
    setStreamLoading(true);
    try {
      const res = await fetch(`/api/admin/money/stream?type=${type}&period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setStreamData(data.entries ?? []);
      }
    } catch { /* non-critical */ } finally {
      setStreamLoading(false);
    }
  }, [period]);

  // Revenue breakdown total (for bar widths)
  const streamTotal = metrics
    ? metrics.platformRevenue
    : 0;

  const streamAmounts: Record<StreamType, number> = {
    rides: metrics ? Math.max(0, metrics.platformRevenue - (metrics.extrasRevenue ?? 0) - (metrics.cancelRevenue ?? 0)) : 0,
    extras: metrics?.extrasRevenue ?? 0,
    deposits: metrics?.cancelRevenue ?? 0,
    shortfalls: metrics?.captureShortfalls?.total ?? 0,
  };

  const hasShortfalls = (metrics?.captureShortfalls?.count ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
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
                    feeAudit.totalVariance < -0.5 ? 'text-red-400' : 'text-emerald-400'
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
                    {feeAudit.expectedPct - feeAudit.actualPct > 0 ? '+' : ''}
                    {(feeAudit.expectedPct - feeAudit.actualPct).toFixed(1)}%
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
                <div><p className="text-xs text-neutral-500">Active</p><p className="text-lg font-bold">{subscriptions.active}</p></div>
                <div><p className="text-xs text-neutral-500">MRR</p><p className="text-lg font-bold font-mono text-blue-400">{fmt(subscriptions.mrr)}</p></div>
                <div><p className="text-xs text-neutral-500">New This Week</p><p className="text-lg font-bold text-emerald-400">+{subscriptions.newThisWeek}</p></div>
                <div><p className="text-xs text-neutral-500">New This Month</p><p className="text-lg font-bold text-emerald-400">+{subscriptions.newThisMonth}</p></div>
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
                        {flag.type.replace(/_/g, ' ')}{flag.amount ? ` · ${fmt(flag.amount)}` : ''}
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
        /* ── Skeleton ── */
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-24" />
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-16" />
            ))}
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl animate-pulse h-64" />
        </div>

      ) : (
        /* ── Overview Tab ── */
        <div className="space-y-5">

          {/* ── Capture Shortfalls Alert ── */}
          {hasShortfalls && (
            <div style={fade(visible, 0)}>
              <button
                onClick={openShortfalls}
                className="w-full text-left bg-orange-500/5 border border-orange-500/30 rounded-xl p-4 hover:bg-orange-500/10 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <span className="text-orange-400 text-lg shrink-0 mt-0.5">⚠</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-orange-400">
                        {metrics!.captureShortfalls.count} Capture Shortfall{metrics!.captureShortfalls.count !== 1 ? 's' : ''}
                      </p>
                      <span className="text-xs font-mono text-orange-300 bg-orange-500/15 px-1.5 py-0.5 rounded">
                        {fmtShort(metrics!.captureShortfalls.total)} uncaptured
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Confirmed add-ons exceeded the authorized reserve on these rides — Stripe capped the capture.
                      <span className="text-orange-400/70 group-hover:text-orange-400 transition-colors ml-1">View details ›</span>
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* ── Profit Hero ── */}
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
            style={fade(visible, 60)}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-neutral-500 mb-1">GMV</p>
                <AnimatedCurrency value={metrics?.gmv ?? 0} className="text-xl font-bold font-mono" />
                <p className="text-[10px] text-neutral-600 mt-0.5">
                  <AnimatedNumber value={metrics?.totalRides ?? 0} /> rides
                </p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Platform Revenue</p>
                <AnimatedCurrency value={metrics?.platformRevenue ?? 0} className="text-xl font-bold font-mono text-emerald-400" />
                <p className="text-[10px] text-neutral-600 mt-0.5">Fees collected from rides</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Stripe Costs</p>
                <AnimatedCurrency value={-(metrics?.stripeFees ?? 0)} className="text-xl font-bold font-mono text-red-400" />
                <p className="text-[10px] text-neutral-600 mt-0.5">2.9% + $0.30 per txn</p>
              </div>
              <div>
                <p className="text-xs text-neutral-500 mb-1">Profit</p>
                <AnimatedCurrency
                  value={metrics?.profit ?? 0}
                  className={`text-xl font-bold font-mono ${(metrics?.profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                />
                <p className="text-[10px] text-neutral-600 mt-0.5">
                  <AnimatedPct value={metrics?.margin ?? 0} /> margin
                </p>
              </div>
            </div>
          </div>

          {/* ── Secondary Metrics ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={fade(visible, 120)}>
            <StatCard label="Driver Payouts" value={fmt(metrics?.driverPayouts ?? 0)} color="blue" />
            <StatCard
              label="Cash Rides"
              value={metrics?.cashRides ?? 0}
              subtitle={fmt(metrics?.cashGmv ?? 0)}
              color="yellow"
            />
            <StatCard label="Fees Waived" value={fmt(metrics?.feesWaived ?? 0)} subtitle="Launch offers" color="yellow" />
            <StatCard
              label="Refunds"
              value={metrics?.refundsCount ?? 0}
              subtitle={metrics?.refundsSum ? fmt(metrics.refundsSum) : undefined}
              color={metrics?.refundsCount ? 'red' : 'white'}
            />
          </div>

          {/* ── Revenue Breakdown ── */}
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-5"
            style={fade(visible, 180)}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Revenue Breakdown</h2>
              <span className="text-[10px] text-neutral-600">Click a stream to see transactions</span>
            </div>
            <div className="space-y-4">
              {(['rides', 'extras', 'deposits', 'shortfalls'] as StreamType[]).map((type, i) => (
                <RevenueStreamRow
                  key={type}
                  type={type}
                  amount={streamAmounts[type]}
                  total={streamTotal + (metrics?.captureShortfalls?.total ?? 0)}
                  visible={visible}
                  delay={220 + i * 60}
                  period={period}
                  onDrillIn={openStream}
                />
              ))}
            </div>
          </div>

          {/* ── Chart + Fee Tiers ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={fade(visible, 280)}>
            <div className="lg:col-span-2">
              <RevenueChart data={dailyRevenue} />
            </div>
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
                            className={`h-full rounded-full transition-all duration-700 ease-out ${tier.tier === 'hmu_first' ? 'bg-blue-500' : 'bg-neutral-500'}`}
                            style={{ width: visible ? `${pct}%` : '0%' }}
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

          {/* ── Unit Economics ── */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4" style={fade(visible, 360)}>
            <h2 className="text-sm font-semibold mb-4">Per-Ride Unit Economics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Avg Price', value: unitEconomics?.avgPrice ?? 0, className: '' },
                { label: 'Avg Fee', value: unitEconomics?.avgPlatformFee ?? 0, className: 'text-emerald-400' },
                { label: 'Avg Stripe', value: -(unitEconomics?.avgStripeFee ?? 0), className: 'text-red-400' },
                { label: 'Avg Profit', value: unitEconomics?.avgProfit ?? 0, className: (unitEconomics?.avgProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
                { label: 'Avg Payout', value: unitEconomics?.avgDriverPayout ?? 0, className: 'text-blue-400' },
              ].map(({ label, value, className }) => (
                <div key={label}>
                  <p className="text-xs text-neutral-500">{label}</p>
                  <AnimatedCurrency value={value} className={`text-lg font-bold font-mono ${className}`} />
                </div>
              ))}
              <div>
                <p className="text-xs text-neutral-500">Total Rides</p>
                <AnimatedNumber value={unitEconomics?.totalRides ?? 0} className="text-lg font-bold" />
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── Shortfalls Slide-Over ── */}
      <SlideOver
        open={shortfallsOpen}
        onClose={() => setShortfallsOpen(false)}
        title={`Capture Shortfalls${metrics?.captureShortfalls?.count ? ` (${metrics.captureShortfalls.count})` : ''}`}
      >
        <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
          <p className="text-xs text-neutral-400">
            These rides had confirmed add-ons exceeding the authorized add-on reserve.
            The capture was capped to the authorized amount — the driver received the full base fare
            but the excess add-on amount was not captured.
          </p>
          {metrics?.captureShortfalls && (
            <p className="text-sm font-mono font-semibold text-orange-400 mt-2">
              Total uncaptured: {fmt(metrics.captureShortfalls.total)}
            </p>
          )}
        </div>

        {shortfallsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-neutral-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : shortfallsData.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-8">No shortfalls found</p>
        ) : (
          <div className="space-y-2">
            {shortfallsData.map((sf) => (
              <a
                key={sf.rideId}
                href={`/ride/${sf.rideId}`}
                target="_blank"
                rel="noreferrer"
                className="block bg-neutral-900 border border-neutral-800 hover:border-orange-500/40 rounded-lg p-3 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-white font-semibold">
                        {sf.refCode || sf.rideId.slice(0, 8)}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        sf.rideStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                        sf.rideStatus === 'ended' ? 'bg-neutral-700 text-neutral-400' :
                        'bg-neutral-700 text-neutral-400'
                      }`}>
                        {sf.rideStatus}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {sf.driverName}{sf.riderHandle ? ` · @${sf.riderHandle}` : ''}
                    </p>
                    <p className="text-[10px] text-neutral-600 mt-0.5 truncate">{sf.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold text-orange-400">{fmt(sf.amount)}</p>
                    <p className="text-[10px] text-neutral-600">
                      {new Date(sf.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <span className="text-[10px] text-neutral-600 group-hover:text-orange-400 transition-colors">open ›</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </SlideOver>

      {/* ── Stream Drill-In Slide-Over ── */}
      <SlideOver
        open={streamOpen !== null}
        onClose={() => setStreamOpen(null)}
        title={streamOpen ? `${STREAM_META[streamOpen].label} — ${period === 'all' ? 'All Time' : period}` : ''}
      >
        {streamLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 bg-neutral-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : streamData.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-8">No entries for this period</p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-neutral-500">{streamData.length} entries</p>
              <p className="text-sm font-mono font-semibold text-emerald-400">
                {fmt(streamData.reduce((s, e) => s + e.amount, 0))} total
              </p>
            </div>
            <div className="space-y-2">
              {streamData.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {entry.rideId && (
                        <a
                          href={`/ride/${entry.rideId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-mono text-neutral-400 hover:text-white transition-colors"
                        >
                          {entry.refCode || entry.rideId.slice(0, 8)} ›
                        </a>
                      )}
                      {entry.driverName && (
                        <p className="text-[10px] text-neutral-600 mt-0.5">{entry.driverName}{entry.riderHandle ? ` · @${entry.riderHandle}` : ''}</p>
                      )}
                      <p className="text-[10px] text-neutral-600 mt-0.5 truncate">{entry.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono font-semibold text-emerald-400">{fmt(entry.amount)}</p>
                      <p className="text-[10px] text-neutral-600">
                        {new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SlideOver>
    </div>
  );
}
