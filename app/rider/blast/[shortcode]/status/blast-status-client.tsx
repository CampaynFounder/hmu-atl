'use client';

// Blast status board — shows contacted drivers and their responses.
// Only drivers the rider swiped right on (notified_at IS NOT NULL) appear here.
// Ably pushes real-time updates; a toast fires when a driver HMUs back.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAbly } from '@/hooks/use-ably';
import {
  CountdownRing,
  CountUpNumber,
  NeuralNetworkLoader,
  PulseOnMount,
  ShimmerSlot,
  StaggeredList,
  SuccessCheckmark,
} from '@/components/blast/motion';

interface DriverInfo {
  handle: string | null;
  displayName: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  vehicleLabel: string | null;
  vehicleColor: string | null;
  chillScore: number;
  completedRides: number;
  tier: string | null;
  minimumFare: number | null;
  lgbtqFriendly: boolean;
}

interface Target {
  targetId: string;
  driverId: string;
  matchScore: number;
  hmuAt: string | null;
  counterPrice: number | null;
  passedAt: string | null;
  selectedAt: string | null;
  pullUpAt: string | null;
  rejectedAt: string | null;
  notifiedAt: string | null;
  driver: DriverInfo;
}

interface Blast {
  id: string;
  status: 'active' | 'matched' | 'cancelled' | 'expired';
  price: number;
  expiresAt: string;
  pickup: { address: string | null };
  dropoff: { address: string | null };
  depositAmount: number;
  targetWindowMs: number;
}

function track(event: string, props?: Record<string, unknown>) {
  try {
    const ph = (globalThis as unknown as { posthog?: { capture: (e: string, p?: unknown) => void } }).posthog;
    if (ph && typeof ph.capture === 'function') ph.capture(event, props);
  } catch { /* best-effort */ }
}

export default function BlastStatusClient({
  blastId,
  shortcode,
}: {
  blastId: string;
  shortcode: string;
}) {
  const router = useRouter();
  const [blast, setBlast] = useState<Blast | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [pullingUpId, setPullingUpId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/blast/${blastId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        blast: Blast;
        targets: Target[];
      };
      setBlast(data.blast);
      setTargets(data.targets ?? []);
    } finally {
      setLoading(false);
    }
  }, [blastId]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useAbly({
    channelName: `blast:${blastId}`,
    blastId,
    onMessage: (msg) => {
      // Rider swiped right on swipe deck → driver moved to pendingTargets here
      if (msg.name === 'target_notified') {
        void refresh();
        return;
      }
      if (msg.name === 'target_hmu' || msg.name === 'target_counter') {
        const t = msg.data as Partial<Target> & { targetId?: string };
        if (!t.targetId) return;
        setTargets((prev) => {
          const idx = prev.findIndex((x) => x.targetId === t.targetId);
          if (idx === -1) return [...prev, t as Target];
          const next = [...prev];
          next[idx] = { ...next[idx], ...(t as Partial<Target>) };
          return next;
        });
        // In-app notification
        const driver = targets.find((x) => x.targetId === t.targetId);
        const name = driver?.driver.displayName ?? driver?.driver.handle ?? 'A driver';
        setToast(`${name} said HMU! 🎉`);
        track('blast_driver_hmu_received', { targetId: t.targetId });
      } else if (msg.name === 'target_pass') {
        const t = msg.data as { targetId?: string; passedAt?: string };
        if (!t.targetId) return;
        setTargets((prev) =>
          prev.map((x) =>
            x.targetId === t.targetId ? { ...x, passedAt: t.passedAt ?? new Date().toISOString() } : x,
          ),
        );
      } else if (msg.name === 'pull_up_started') {
        const t = msg.data as { rideId?: string };
        if (t.rideId) router.push(`/ride/${t.rideId}`);
      } else if (msg.name === 'match_locked' || msg.name === 'blast_cancelled' || msg.name === 'blast_bumped') {
        void refresh();
      }
    },
  });

  const interestedTargets = useMemo(
    () => targets.filter((t) => t.hmuAt && !t.passedAt && !t.rejectedAt),
    [targets],
  );
  const pendingTargets = useMemo(
    () => targets.filter((t) => t.notifiedAt && !t.hmuAt && !t.passedAt && !t.rejectedAt),
    [targets],
  );
  const selectedTarget = useMemo(
    () => targets.find((t) => t.selectedAt && !t.rejectedAt) ?? null,
    [targets],
  );

  const targetWindowMs = blast?.targetWindowMs ?? 15 * 60_000;

  const perTargetSecondsLeft = (notifiedAtIso: string | null): number => {
    if (!notifiedAtIso) return targetWindowMs / 1000;
    const elapsed = now - new Date(notifiedAtIso).getTime();
    return Math.max(0, Math.floor((targetWindowMs - elapsed) / 1000));
  };

  const handleSelect = useCallback(
    async (target: Target) => {
      if (selectingId || pullingUpId) return;
      setSelectingId(target.targetId);
      setTargets((prev) =>
        prev.map((t) =>
          t.targetId === target.targetId ? { ...t, selectedAt: new Date().toISOString() } : t,
        ),
      );
      try {
        const res = await fetch(`/api/blast/${blastId}/select/${target.targetId}`, { method: 'POST' });
        const body = (await res.json().catch(() => ({}))) as { rideId?: string; error?: string; message?: string };
        if (res.ok) {
          track('blast_selected', { targetId: target.targetId });
          await refresh();
          return;
        }
        setTargets((prev) => prev.map((t) => (t.targetId === target.targetId ? { ...t, selectedAt: null } : t)));
        setToast(body.message ?? body.error ?? 'Could not match');
      } finally {
        setSelectingId(null);
      }
    },
    [selectingId, pullingUpId, blastId, refresh],
  );

  const handlePullUp = useCallback(
    async (target: Target) => {
      if (pullingUpId) return;
      setPullingUpId(target.targetId);
      try {
        const res = await fetch(`/api/blast/${blastId}/pull-up/${target.targetId}`, { method: 'POST' });
        const body = (await res.json().catch(() => ({}))) as { rideId?: string; error?: string };
        if (res.ok && body.rideId) {
          track('blast_pulled_up', { priceDollars: target.counterPrice ?? blast?.price ?? 0 });
          window.setTimeout(() => router.push(`/ride/${body.rideId}`), 600);
          return;
        }
        setToast(body.error ?? 'Could not pull up');
      } finally {
        setPullingUpId(null);
      }
    },
    [pullingUpId, blastId, blast?.price, router],
  );

  const handleDuplicate = useCallback(async () => {
    track('blast_duplicated', { sourceBlastId: blastId });
    const res = await fetch(`/api/blast/${blastId}/duplicate`, { method: 'POST' });
    if (!res.ok) { setToast('Could not duplicate this blast'); return; }
    try {
      const data = (await res.json()) as { draft: unknown };
      sessionStorage.setItem('blast:draft:duplicated', JSON.stringify(data.draft));
    } catch { /* best-effort */ }
    router.push('/rider/blast/new?from=duplicate');
  }, [blastId, router]);

  if (loading || !blast) {
    return (
      <div className="min-h-screen bg-black text-white" style={{ paddingTop: 'var(--header-height)' }}>
        <div className="px-4 pt-6 space-y-4">
          <ShimmerSlot width={160} height={24} radius={6} />
          <ShimmerSlot width="100%" height={80} radius={16} />
          <ShimmerSlot width="100%" height={80} radius={16} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-black text-white pb-20"
      style={{ paddingTop: 'var(--header-height)' }}
    >
      {/* ── Header ── */}
      <header className="px-4 pt-4 pb-3">
        <button
          onClick={() => router.push(`/rider/blast/${shortcode}`)}
          className="text-xs text-neutral-500 hover:text-white mb-3 flex items-center gap-1.5 transition-colors"
        >
          ← Back to deck
        </button>
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <CountUpNumber value={blast.price} formatter={(n) => `$${Math.round(n)}`} /> ride
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5 truncate">
              {blast.pickup.address ?? 'pickup'} → {blast.dropoff.address ?? 'dropoff'}
            </p>
          </div>
        </div>
      </header>

      <main className="px-3 mt-2 space-y-4">
        {/* ── HMU'd section ── */}
        {interestedTargets.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 px-1 mb-3">
              Said HMU ({interestedTargets.length})
            </h2>
            <StaggeredList staggerMs={80} as="ul" className="space-y-2">
              {interestedTargets.map((t) => {
                const isDimmed = selectedTarget && selectedTarget.targetId !== t.targetId;
                const isSelected = selectedTarget?.targetId === t.targetId;
                const counter = t.counterPrice && t.counterPrice !== blast.price;
                const secsLeft = perTargetSecondsLeft(t.notifiedAt);
                return (
                  <motion.li
                    key={t.targetId}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: isDimmed ? 0.4 : 1, x: 0, scale: isSelected ? 1.02 : 1 }}
                    transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
                    className={`bg-neutral-900 border ${isSelected ? 'border-[#00E676]' : 'border-neutral-800'} rounded-2xl p-3 list-none`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 flex-shrink-0">
                        <CountdownRing size={48} strokeWidth={3} secondsRemaining={secsLeft} totalSeconds={targetWindowMs / 1000} />
                        <div className="absolute inset-1 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center text-sm font-bold">
                          {t.driver.thumbnailUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={t.driver.thumbnailUrl} alt="" className="w-full h-full object-cover object-top" />
                            : (t.driver.displayName ?? t.driver.handle ?? '?')[0]?.toUpperCase()
                          }
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                          {t.driver.displayName ?? t.driver.handle ?? 'Driver'}
                          {t.driver.tier === 'hmu_first' && (
                            <span className="text-[9px] uppercase bg-amber-500/90 text-black px-1.5 rounded">First</span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          {t.driver.chillScore > 0 && (
                            <span><span className="text-[#00E676] font-semibold">{Math.round(t.driver.chillScore)}%</span> chill</span>
                          )}
                          {t.driver.completedRides > 0 && (
                            <span><span className="text-white font-semibold">{t.driver.completedRides}</span> rides</span>
                          )}
                          {t.driver.vehicleLabel && <span className="text-neutral-600">🚗 {t.driver.vehicleLabel}</span>}
                          {counter && (
                            <span className="text-amber-400 inline-flex items-center gap-1">
                              <CountUpNumber value={t.counterPrice ?? 0} formatter={(n) => `$${Math.round(n)}`} />
                              <span className="text-neutral-600">counter</span>
                            </span>
                          )}
                        </div>
                      </div>
                      {!selectedTarget && (
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          onClick={() => handleSelect(t)}
                          disabled={selectingId != null}
                          className="bg-white text-black text-sm font-bold px-4 py-2 rounded-xl disabled:bg-neutral-800 disabled:text-neutral-500 min-w-[72px]"
                        >
                          {selectingId === t.targetId ? '…' : 'Select'}
                        </motion.button>
                      )}
                      {isSelected && (
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                          onClick={() => handlePullUp(t)}
                          disabled={pullingUpId != null}
                          className="bg-[#00E676] text-black text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60 min-w-[88px] flex items-center justify-center"
                        >
                          {pullingUpId === t.targetId ? <SuccessCheckmark size={20} autoHide={false} /> : 'Pull Up'}
                        </motion.button>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </StaggeredList>
          </section>
        )}

        {/* ── Pending — waiting for driver response ── */}
        {pendingTargets.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 px-1 mb-3">
              Blast sent to ({pendingTargets.length})
            </h2>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
              <ul className="divide-y divide-neutral-800">
                {pendingTargets.map((t) => {
                  const secsLeft = perTargetSecondsLeft(t.notifiedAt);
                  const pct = Math.max(0, Math.min(1, secsLeft / (targetWindowMs / 1000)));
                  return (
                    <li key={t.targetId} className="flex items-center gap-3 px-4 py-3">
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <svg width="40" height="40" className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                          <circle
                            cx="20" cy="20" r="17" fill="none"
                            stroke={pct > 0.33 ? 'rgba(0,230,118,0.5)' : pct > 0.1 ? 'rgba(255,179,0,0.5)' : 'rgba(255,68,68,0.5)'}
                            strokeWidth="2.5"
                            strokeDasharray={`${2 * Math.PI * 17}`}
                            strokeDashoffset={`${2 * Math.PI * 17 * (1 - pct)}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-1 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center text-xs font-bold text-white">
                          {t.driver.thumbnailUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={t.driver.thumbnailUrl} alt="" className="w-full h-full object-cover object-top" />
                            : (t.driver.displayName ?? t.driver.handle ?? '?')[0]?.toUpperCase()
                          }
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                          {t.driver.displayName ?? t.driver.handle ?? 'Driver'}
                          {t.driver.tier === 'hmu_first' && (
                            <span className="text-[9px] bg-amber-500/90 text-black px-1.5 rounded font-bold">1ST</span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-2">
                          {t.driver.chillScore > 0 && (
                            <span><span className="text-[#00E676] font-semibold">{Math.round(t.driver.chillScore)}%</span> chill</span>
                          )}
                          {t.driver.vehicleLabel && <span className="text-neutral-600">🚗 {t.driver.vehicleLabel}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[11px] font-mono tabular-nums" style={{ color: pct > 0.33 ? '#888' : pct > 0.1 ? '#FFB300' : '#FF4444' }}>
                          {Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')}
                        </div>
                        <div className="text-[9px] text-neutral-700 mt-0.5">deciding</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* ── Empty state ── */}
        {targets.length === 0 && (
          <div className="rounded-2xl overflow-hidden mt-2">
            <NeuralNetworkLoader label="Waiting for driver responses…" />
          </div>
        )}

        {/* ── Send another blast ── */}
        <div className="mt-6 px-1">
          <button
            onClick={handleDuplicate}
            className="w-full text-sm text-neutral-400 hover:text-white py-3 border border-neutral-800 rounded-2xl transition-colors"
          >
            Send another blast (same details)
          </button>
        </div>
      </main>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <ToastShim message={toast} onTimeout={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ToastShim({ message, onTimeout }: { message: string; onTimeout: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onTimeout, 2800);
    return () => window.clearTimeout(t);
  }, [onTimeout]);
  return (
    <PulseOnMount>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50 whitespace-nowrap">
        {message}
      </div>
    </PulseOnMount>
  );
}
