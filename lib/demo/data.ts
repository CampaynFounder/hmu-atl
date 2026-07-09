// Admin-entered demo data for the App Store reviewer accounts.
//
// The reviewer driver (+1 404 696 5907) and rider (+1 404 696 5908) accounts
// have no real rides/Stripe balance, so their dashboards would look empty. This
// lets a superadmin type in believable numbers at /admin/demo-data; the driver
// balance/analytics/earnings endpoints and the rider ride-history endpoint
// return those values INSTEAD of querying Stripe/DB — but ONLY for the demo
// accounts (gated by isDemoPhone). Everyone else is untouched.
//
// Stored in platform_config (no migration). Both configs default to
// `enabled: false`, so nothing changes until an admin fills them in.

import { getPlatformConfig } from '@/lib/platform-config/get';

export const DEMO_DRIVER_KEY = 'demo.driver_financials';
export const DEMO_RIDER_KEY = 'demo.rider_history';

export type DemoTier = 'hmu_first' | 'free';

export interface DemoMonth {
  month: string; // 'YYYY-MM'
  cash: number;
  hmuPay: number;
  delivery: number;
  deliveryJobs: number;
  rides: number;
}

export interface DemoDriverFinancials {
  enabled: boolean;
  walletAvailable: number; // withdrawable balance — also the cash-out amount
  walletPending: number;
  tier: DemoTier;
  months: DemoMonth[];
}

export interface DemoRiderRide {
  date: string; // 'YYYY-MM-DD'
  driverName: string;
  driverHandle: string;
  pickup: string;
  dropoff: string;
  amount: number;
  rating: string; // '', 'chill', 'cool_af', 'kinda_creepy', 'weirdo'
}

export interface DemoRiderHistory {
  enabled: boolean;
  rides: DemoRiderRide[];
}

export const DEFAULT_DEMO_DRIVER: DemoDriverFinancials = {
  enabled: false, walletAvailable: 0, walletPending: 0, tier: 'hmu_first', months: [],
};
export const DEFAULT_DEMO_RIDER: DemoRiderHistory = { enabled: false, rides: [] };

export async function getDemoDriverFinancials(): Promise<DemoDriverFinancials> {
  const cfg = (await getPlatformConfig(
    DEMO_DRIVER_KEY,
    DEFAULT_DEMO_DRIVER as unknown as Record<string, unknown>,
  )) as unknown as DemoDriverFinancials;
  return {
    enabled: cfg.enabled === true,
    walletAvailable: Number(cfg.walletAvailable) || 0,
    walletPending: Number(cfg.walletPending) || 0,
    tier: cfg.tier === 'free' ? 'free' : 'hmu_first',
    months: Array.isArray(cfg.months) ? cfg.months : [],
  };
}

export async function getDemoRiderHistory(): Promise<DemoRiderHistory> {
  const cfg = (await getPlatformConfig(
    DEMO_RIDER_KEY,
    DEFAULT_DEMO_RIDER as unknown as Record<string, unknown>,
  )) as unknown as DemoRiderHistory;
  return {
    enabled: cfg.enabled === true,
    rides: Array.isArray(cfg.rides) ? cfg.rides : [],
  };
}

// ── builders ────────────────────────────────────────────────────────────────

// Split a dollar total into `n` cents-exact per-day amounts (sum === total).
function spreadCents(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}
function spreadInts(total: number, n: number): number[] {
  if (n <= 0) return [];
  const t = Math.max(0, Math.round(Number(total) || 0));
  const base = Math.floor(t / n);
  const rem = t - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export interface DemoDailyPoint { day: string; cash: number; nonCash: number; delivery: number; rides: number }

// Spread each entered month evenly across its days so the Day / Week / Month
// chart views all render populated bars, and each month sums to its exact total.
export function buildDemoTimeseries(cfg: DemoDriverFinancials): DemoDailyPoint[] {
  const out: DemoDailyPoint[] = [];
  for (const m of cfg.months) {
    const [y, mo] = String(m.month || '').split('-').map(Number);
    if (!y || !mo || mo < 1 || mo > 12) continue;
    const days = new Date(y, mo, 0).getDate(); // last day of month
    const cashD = spreadCents(m.cash, days);
    const hmuD = spreadCents(m.hmuPay, days);
    const delD = spreadCents(m.delivery, days);
    const rideD = spreadInts(m.rides, days);
    for (let d = 1; d <= days; d++) {
      out.push({
        day: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        cash: cashD[d - 1], nonCash: hmuD[d - 1], delivery: delD[d - 1], rides: rideD[d - 1],
      });
    }
  }
  out.sort((a, b) => (a.day < b.day ? -1 : 1));
  return out;
}

function monthTotals(cfg: DemoDriverFinancials) {
  return cfg.months.reduce(
    (acc, m) => ({
      cash: acc.cash + (Number(m.cash) || 0),
      hmuPay: acc.hmuPay + (Number(m.hmuPay) || 0),
      delivery: acc.delivery + (Number(m.delivery) || 0),
      deliveryJobs: acc.deliveryJobs + (Math.round(Number(m.deliveryJobs)) || 0),
      rides: acc.rides + (Math.round(Number(m.rides)) || 0),
    }),
    { cash: 0, hmuPay: 0, delivery: 0, deliveryJobs: 0, rides: 0 },
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Build the /driver/balance response. `ctx` carries the real, admin-tunable
// chart palette / active mode / flag so those keep behaving normally.
export function buildDemoBalance(
  cfg: DemoDriverFinancials,
  ctx: { chartPalette: unknown; activeMode: string; depositsDetailSheet: boolean },
) {
  const t = monthTotals(cfg);
  const available = r2(cfg.walletAvailable);
  const pending = r2(cfg.walletPending);
  const payoutStatus = available > 0 ? 'ready' : pending > 0 ? 'pending_hold' : 'no_balance';
  const tier = cfg.tier === 'free' ? 'free' : 'hmu_first';
  return {
    available,
    pending,
    instantAvailable: available,
    instantEligible: true,
    platformInstantEnabled: true,
    fundsAvailableOn: null,
    tier,
    currency: 'usd',
    activeMode: ctx.activeMode,
    payoutStatus,
    cashEarnings: { rides: t.rides, total: r2(t.cash) },
    digitalEarnings: { rides: t.rides, total: r2(t.hmuPay) },
    noShowEarnings: { rides: 0, total: 0 },
    deliveryEarnings: { jobs: t.deliveryJobs, total: r2(t.delivery) },
    chartPalette: ctx.chartPalette,
    flags: { depositsDetailSheet: ctx.depositsDetailSheet },
  };
}

// Build the /driver/analytics response (chart timeseries + aggregate).
export function buildDemoAnalytics(cfg: DemoDriverFinancials) {
  const timeseries = buildDemoTimeseries(cfg);
  const t = monthTotals(cfg);
  const totalEarned = r2(t.cash + t.hmuPay + t.delivery);
  return {
    rides: [] as unknown[],
    aggregate: {
      avgRatePerMile: 0, avgRatePerMinute: 0, avgRatePerHour: 0,
      totalMiles: 0, totalMinutes: 0, totalRides: t.rides,
      totalEarned, ratedRides: 0, excludedRides: 0,
    },
    timeseries,
    comparison: {
      area: 'Atlanta', yourAvgPerMile: 0, areaAvgPerMile: 0,
      percentile: 50, yourAvgPerMinute: 0, areaAvgPerMinute: 0,
    },
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Build the /driver/earnings today/week tiles from the synthesized timeseries.
export function buildDemoEarnings(cfg: DemoDriverFinancials) {
  const ts = buildDemoTimeseries(cfg);
  const byDay = new Map(ts.map((p) => [p.day, p]));
  const now = new Date();
  const todayKey = isoDay(now);
  const weekAgoKey = isoDay(new Date(now.getTime() - 6 * 86_400_000));

  const today = byDay.get(todayKey);
  const todayGross = today ? r2(today.cash + today.nonCash + today.delivery) : 0;
  const todayRides = today ? today.rides : 0;

  let weekGross = 0, weekRides = 0;
  for (const p of ts) {
    if (p.day >= weekAgoKey && p.day <= todayKey) {
      weekGross += p.cash + p.nonCash + p.delivery;
      weekRides += p.rides;
    }
  }

  const tier = cfg.tier === 'free' ? 'free' : 'hmu_first';
  const dailyCap = tier === 'hmu_first' ? 25 : 40;
  const weeklyCap = tier === 'hmu_first' ? 100 : 150;

  return {
    today: { gross: todayGross, fees: 0, kept: todayGross, rides: todayRides, capHit: false, capUsed: 0, capMax: dailyCap },
    week: { gross: r2(weekGross), fees: 0, kept: r2(weekGross), rides: weekRides, capHit: false, capUsed: 0, capMax: weeklyCap },
    tier,
  };
}

// Build the /rides/history `rides` array for the demo rider (rider perspective).
export function buildDemoRiderRides(cfg: DemoRiderHistory) {
  return cfg.rides.map((ride, i) => {
    const amount = r2(Number(ride.amount) || 0);
    const at = `${ride.date}T12:00:00.000Z`;
    return {
      id: `demo-${i}`,
      ref_code: null,
      status: 'completed',
      amount,
      final_agreed_price: amount,
      driver_payout_amount: null,
      platform_fee_amount: null,
      driver_rating: ride.rating || null,
      rider_rating: null,
      driver_name: ride.driverName || 'Driver',
      driver_handle: ride.driverHandle || null,
      rider_name: null,
      rider_handle: null,
      pickup_address: ride.pickup || null,
      dropoff_address: ride.dropoff || null,
      destination: ride.dropoff || null,
      is_cash: false,
      visible_deposit: 0,
      pricing_mode_key: null,
      is_deposit_mode: false,
      cash_to_collect: 0,
      breakdown: null,
      booking_method: 'direct',
      created_at: at,
      started_at: at,
      ended_at: at,
      dispute_window_expires_at: null,
    };
  });
}
