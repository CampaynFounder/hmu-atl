'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMarket } from '@/app/admin/components/market-context';
import { renderSms, LIFECYCLE_STAGES, type CoverageBucket, type LifecycleStage } from '@/lib/admin/activation-checks';

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
  stage: LifecycleStage;
  accountStatus: string;
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
  stage: LifecycleStage;
  accountStatus: string;
  completeness: number;
  checks: CheckRow[];
}

type StageCounts = Record<LifecycleStage, number>;

const STAGE_LABELS: Record<LifecycleStage, string> = {
  signup: 'Signup',
  profile_incomplete: 'Profile',
  payment_setup: 'Payment',
  ready_idle: 'Ready, idle',
  engaged: 'Engaged',
  dormant: 'Dormant',
};

const STAGE_TONES: Record<LifecycleStage, string> = {
  signup: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
  profile_incomplete: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  payment_setup: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  ready_idle: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  engaged: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  dormant: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/40',
};

const EMPTY_COUNTS: StageCounts = {
  signup: 0, profile_incomplete: 0, payment_setup: 0, ready_idle: 0, engaged: 0, dormant: 0,
};

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
  const [stageCounts, setStageCounts] = useState<{ drivers: StageCounts; riders: StageCounts }>({
    drivers: EMPTY_COUNTS, riders: EMPTY_COUNTS,
  });
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incomplete'>('incomplete');
  const [stageFilter, setStageFilter] = useState<LifecycleStage | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMarketId) params.set('marketId', selectedMarketId);
      // Intentionally do NOT pass stage to the server — we keep the full list
      // client-side so flipping chips is instant. Counts come back unfiltered
      // either way because the server computes them pre-filter.
      const res = await fetch(`/api/admin/activation?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDrivers(data.drivers ?? []);
        setRiders(data.riders ?? []);
        setStageCounts(data.stageCounts ?? { drivers: EMPTY_COUNTS, riders: EMPTY_COUNTS });
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMarketId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const visibleDrivers = useMemo(() => {
    let out = drivers;
    if (stageFilter) out = out.filter(d => d.stage === stageFilter);
    if (filter === 'incomplete') out = out.filter(d => d.completeness < 100);
    return out;
  }, [drivers, filter, stageFilter]);
  const visibleRiders = useMemo(() => {
    let out = riders;
    if (stageFilter) out = out.filter(r => r.stage === stageFilter);
    if (filter === 'incomplete') out = out.filter(r => r.completeness < 100);
    return out;
  }, [riders, filter, stageFilter]);

  const activeCounts = tab === 'drivers' ? stageCounts.drivers : stageCounts.riders;

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-white">Activation</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Every signed-up driver and rider, grouped by lifecycle stage. Pick a stage to see who's stuck there, then nudge.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <StageChip
          label="All"
          count={LIFECYCLE_STAGES.reduce((sum, s) => sum + activeCounts[s], 0)}
          active={stageFilter === null}
          tone="bg-neutral-800 text-white border-neutral-700"
          onClick={() => setStageFilter(null)}
        />
        {LIFECYCLE_STAGES.map(s => (
          <StageChip
            key={s}
            label={STAGE_LABELS[s]}
            count={activeCounts[s]}
            active={stageFilter === s}
            tone={STAGE_TONES[s]}
            onClick={() => setStageFilter(stageFilter === s ? null : s)}
          />
        ))}
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

      {stageFilter && (
        <BulkNudgeBar
          stage={stageFilter}
          profileType={tab === 'drivers' ? 'driver' : 'rider'}
          marketId={selectedMarketId}
          recipientCount={tab === 'drivers' ? visibleDrivers.length : visibleRiders.length}
          checks={tab === 'drivers' ? collectFailedCheckKeys(visibleDrivers) : collectFailedCheckKeys(visibleRiders)}
          onSent={fetchData}
        />
      )}

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

function collectFailedCheckKeys(items: Array<{ checks: CheckRow[] }>): Array<{ key: string; label: string }> {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const c of item.checks) {
      if (!c.passed && !seen.has(c.key)) seen.set(c.key, c.label);
    }
  }
  return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
}

function BulkNudgeBar({
  stage, profileType, marketId, recipientCount, checks, onSent,
}: {
  stage: LifecycleStage;
  profileType: 'driver' | 'rider';
  marketId: string | null;
  recipientCount: number;
  checks: Array<{ key: string; label: string }>;
  onSent: () => void;
}) {
  const [checkKey, setCheckKey] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Default to first available check when stage/tab changes.
  useEffect(() => {
    setCheckKey(checks[0]?.key ?? '');
    setResult(null);
  }, [stage, profileType, checks]);

  const send = async () => {
    if (!checkKey || busy || recipientCount === 0) return;
    const checkLabel = checks.find(c => c.key === checkKey)?.label ?? checkKey;
    const ok = window.confirm(
      `Send "${checkLabel}" SMS to ~${recipientCount} ${profileType}s currently in stage "${STAGE_LABELS[stage]}"?\n\n` +
      `This costs real $$ via voip.ms and is logged. Users who already pass this check OR were nudged with this exact check in the last 72h are auto-skipped.`
    );
    if (!ok) return;

    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/activation/bulk-nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, checkKey, profileType, marketId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(`Error: ${data.error ?? 'unknown'}`);
      } else {
        const parts = [`Sent ${data.sent}/${data.total} (${data.failed} failed)`];
        if (data.skipped_recent > 0) {
          parts.push(`skipped ${data.skipped_recent} already-nudged within ${data.window_hours}h`);
        }
        if (data.message) parts.push(data.message);
        setResult(parts.join(' — '));
        onSent();
      }
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 flex items-center gap-3 flex-wrap">
      <span className="text-xs text-amber-200 font-semibold">
        Bulk nudge {recipientCount} {profileType}s in {STAGE_LABELS[stage]}
      </span>
      <select
        value={checkKey}
        onChange={(e) => setCheckKey(e.target.value)}
        disabled={busy || checks.length === 0}
        className="bg-neutral-900 border border-neutral-700 text-white text-xs rounded-md px-2 py-1.5"
      >
        {checks.length === 0 ? (
          <option value="">No gaps in this cohort</option>
        ) : (
          checks.map(c => <option key={c.key} value={c.key}>{c.label}</option>)
        )}
      </select>
      <button
        onClick={send}
        disabled={busy || !checkKey || recipientCount === 0}
        className="text-xs px-3 py-1.5 rounded-md font-semibold bg-amber-500 text-neutral-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? 'Sending…' : 'Send to all'}
      </button>
      {result && <span className="text-xs text-neutral-300">{result}</span>}
    </div>
  );
}

function StageChip({
  label, count, active, tone, onClick,
}: { label: string; count: number; active: boolean; tone: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-3 py-1.5 rounded-full font-semibold border transition-colors ${
        active ? `${tone} ring-1 ring-white/30` : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
      }`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
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
            <StageBadge stage={driver.stage} />
            {driver.accountStatus === 'pending_activation' && <PendingApprovalBadge />}
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
                  <StageBadge stage={r.stage} />
                  {r.accountStatus === 'pending_activation' && <PendingApprovalBadge />}
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

function PendingApprovalBadge() {
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-yellow-500/15 text-yellow-300 border-yellow-500/40"
      title="account_status = 'pending_activation' — awaiting admin approval"
    >
      Pending approval
    </span>
  );
}

function StageBadge({ stage }: { stage: LifecycleStage }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${STAGE_TONES[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
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

  const doSend = async (ackDuplicate: boolean): Promise<void> => {
    if (!phone) { setStatus('error'); return; }
    const message = renderSms(check.smsTemplate, displayName);
    const truncated = message.length > 160 ? message.slice(0, 160) : message;
    const res = await fetch('/api/admin/marketing/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: [{ phone, name: displayName, userId }],
        message: truncated,
        eventType: `activation_nudge:${check.key}`,
        dedup: { enabled: true, ackDuplicate },
      }),
    });
    const data = await res.json();
    if (res.status === 409 && data.error === 'duplicate_within_window') {
      const lastSent = data.lastSentAt ? new Date(data.lastSentAt) : null;
      const ago = lastSent ? friendlyAgo(lastSent) : 'recently';
      const ok = window.confirm(
        `Already sent this nudge ${ago} (within the ${data.windowHours}h dedup window).\n\nSend again anyway?`
      );
      if (!ok) { setStatus('idle'); return; }
      return doSend(true);  // re-send with ackDuplicate
    }
    if (res.ok && data.sent > 0) {
      setStatus('sent');
      onSent();
    } else {
      setStatus('error');
    }
  };

  const send = async () => {
    if (!phone || busy) return;
    setBusy(true);
    try { await doSend(false); }
    catch { setStatus('error'); }
    finally {
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

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function friendlyAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
