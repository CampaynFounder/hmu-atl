'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMarket } from '@/app/admin/components/market-context';
import { renderSms, type CoverageBucket } from '@/lib/admin/activation-checks';

interface CheckRow {
  key: string;
  label: string;
  passed: boolean;
  smsTemplate: string;
}

interface DriverItem {
  userId: string;
  displayName: string | null;
  handle: string | null;
  phone: string | null;
  areaNames: string[];
  coverage: { bucket: CoverageBucket; label: string; areaCount: number };
  lastSignInAt: string | null;
  completeness: number;
  checks: CheckRow[];
}

interface RiderItem {
  userId: string;
  displayName: string | null;
  phone: string | null;
  lastSignInAt: string | null;
  ridesCompleted: number;
  rideRequests: number;
  completeness: number;
  checks: CheckRow[];
}

const COVERAGE_STYLES: Record<CoverageBucket, string> = {
  all_over: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  wide: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  solid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  niche: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  none: 'bg-red-500/15 text-red-400 border-red-500/40',
};

export function ActivationClient() {
  const { selectedMarketId } = useMarket();
  const [tab, setTab] = useState<'drivers' | 'riders'>('drivers');
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [riders, setRiders] = useState<RiderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incomplete'>('incomplete');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMarketId) params.set('marketId', selectedMarketId);
      const res = await fetch(`/api/admin/activation?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDrivers(data.drivers ?? []);
        setRiders(data.riders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMarketId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const visibleDrivers = useMemo(() =>
    filter === 'all' ? drivers : drivers.filter(d => d.completeness < 100),
    [drivers, filter],
  );
  const visibleRiders = useMemo(() =>
    filter === 'all' ? riders : riders.filter(r => r.completeness < 100),
    [riders, filter],
  );

  const driverStats = useMemo(() => bucketStats(drivers.map(d => d.coverage.bucket)), [drivers]);

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-white">Activation</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Payment-ready users only. Nudge anyone with red gaps to push them closer to their first match.
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="All Over" value={driverStats.all_over} tone="blue" />
        <StatCard label="Wide / Solid" value={driverStats.wide + driverStats.solid} tone="emerald" />
        <StatCard label="Niche" value={driverStats.niche} tone="amber" />
        <StatCard label="No Areas" value={driverStats.none} tone="red" />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1">
          {(['drivers', 'riders'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                tab === t ? 'bg-[#00E676] text-neutral-950' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {t} ({t === 'drivers' ? drivers.length : riders.length})
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1">
          {([['incomplete', 'Has gaps'], ['all', 'All']] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                filter === k ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-neutral-500 text-sm">Loading…</div>
      ) : tab === 'drivers' ? (
        <DriverList items={visibleDrivers} onSent={fetchData} />
      ) : (
        <RiderList items={visibleRiders} onSent={fetchData} />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'emerald' | 'amber' | 'red' }) {
  const tones = {
    blue: 'border-blue-500/30 text-blue-300',
    emerald: 'border-emerald-500/30 text-emerald-300',
    amber: 'border-amber-500/30 text-amber-300',
    red: 'border-red-500/30 text-red-400',
  } as const;
  return (
    <div className={`bg-neutral-900 border ${tones[tone]} rounded-xl p-3`}>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  );
}

function DriverList({ items, onSent }: { items: DriverItem[]; onSent: () => void }) {
  if (items.length === 0) {
    return <div className="p-12 text-center text-neutral-500 text-sm">No drivers match.</div>;
  }
  return (
    <div className="space-y-2">
      {items.map(d => (
        <DriverRow key={d.userId} driver={d} onSent={onSent} />
      ))}
    </div>
  );
}

function DriverRow({ driver, onSent }: { driver: DriverItem; onSent: () => void }) {
  const failed = driver.checks.filter(c => !c.passed);
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 md:p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-semibold">{driver.displayName || 'No name'}</p>
            {driver.handle && <span className="text-xs text-neutral-500 font-mono">@{driver.handle}</span>}
            <CompletenessPill pct={driver.completeness} />
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${COVERAGE_STYLES[driver.coverage.bucket]}`}>
              {driver.coverage.label}
            </span>
            {driver.coverage.bucket !== 'all_over' && driver.areaNames.slice(0, 6).map(a => (
              <span key={a} className="text-[10px] text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-full">{a}</span>
            ))}
            {driver.coverage.bucket !== 'all_over' && driver.areaNames.length > 6 && (
              <span className="text-[10px] text-neutral-500">+{driver.areaNames.length - 6} more</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {driver.phone && <p className="text-[11px] text-neutral-400 font-mono">{driver.phone}</p>}
          {driver.lastSignInAt && (
            <p className="text-[10px] text-neutral-600 mt-0.5">
              last login {timeAgo(driver.lastSignInAt)}
            </p>
          )}
        </div>
      </div>

      {failed.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center gap-2 flex-wrap">
          {failed.map(c => (
            <NudgeChip
              key={c.key}
              userId={driver.userId}
              phone={driver.phone}
              displayName={driver.displayName}
              check={c}
              onSent={onSent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RiderList({ items, onSent }: { items: RiderItem[]; onSent: () => void }) {
  if (items.length === 0) {
    return <div className="p-12 text-center text-neutral-500 text-sm">No riders match.</div>;
  }
  return (
    <div className="space-y-2">
      {items.map(r => {
        const failed = r.checks.filter(c => !c.passed);
        return (
          <div key={r.userId} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 md:p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-semibold">{r.displayName || 'No name'}</p>
                  <CompletenessPill pct={r.completeness} />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  {r.ridesCompleted} ride{r.ridesCompleted === 1 ? '' : 's'} · {r.rideRequests} request{r.rideRequests === 1 ? '' : 's'}
                </p>
              </div>
              <div className="text-right shrink-0">
                {r.phone && <p className="text-[11px] text-neutral-400 font-mono">{r.phone}</p>}
                {r.lastSignInAt && (
                  <p className="text-[10px] text-neutral-600 mt-0.5">last login {timeAgo(r.lastSignInAt)}</p>
                )}
              </div>
            </div>
            {failed.length > 0 && (
              <div className="mt-3 pt-3 border-t border-neutral-800 flex items-center gap-2 flex-wrap">
                {failed.map(c => (
                  <NudgeChip
                    key={c.key}
                    userId={r.userId}
                    phone={r.phone}
                    displayName={r.displayName}
                    check={c}
                    onSent={onSent}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CompletenessPill({ pct }: { pct: number }) {
  const tone =
    pct === 100 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
    pct >= 70 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
    'bg-red-500/15 text-red-400 border-red-500/40';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${tone}`}>
      {pct}% complete
    </span>
  );
}

function NudgeChip({
  userId, phone, displayName, check, onSent,
}: {
  userId: string;
  phone: string | null;
  displayName: string | null;
  check: CheckRow;
  onSent: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');

  const send = async () => {
    if (!phone) { setStatus('error'); return; }
    if (busy) return;
    setBusy(true);
    try {
      const message = renderSms(check.smsTemplate, displayName);
      const truncated = message.length > 160 ? message.slice(0, 160) : message;
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [{ phone, name: displayName, userId }],
          message: truncated,
        }),
      });
      const data = await res.json();
      if (res.ok && data.sent > 0) {
        setStatus('sent');
        onSent();
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus('idle'), 2500);
    }
  };

  const baseColor =
    status === 'sent' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' :
    status === 'error' ? 'bg-red-500/20 text-red-300 border-red-500/50' :
    'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20';

  const label =
    status === 'sent' ? `✓ ${check.label} sent` :
    status === 'error' ? `× ${check.label} failed` :
    `Nudge: ${check.label}`;

  return (
    <button
      onClick={send}
      disabled={busy || !phone}
      title={renderSms(check.smsTemplate, displayName)}
      className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border transition-colors disabled:opacity-50 ${baseColor}`}
    >
      {label}
    </button>
  );
}

function bucketStats(buckets: CoverageBucket[]): Record<CoverageBucket, number> {
  const out: Record<CoverageBucket, number> = { all_over: 0, wide: 0, solid: 0, niche: 0, none: 0 };
  for (const b of buckets) out[b] += 1;
  return out;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
