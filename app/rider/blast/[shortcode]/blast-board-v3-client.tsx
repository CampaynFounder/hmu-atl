'use client';

// Live offer board (v3) — per docs/BLAST-V3-AGENT-CONTRACT.md §6.6.
//
// Sections:
//   • Header: trip summary + countdown + "Cancel" secondary
//   • HMU'd: drivers who said yes (with optional counter price)
//   • Searching: NeuralNetworkLoader empty state when no HMUs yet
//   • More options: fallback drivers we surface but didn't notify
//
// All animation primitives come from components/blast/motion (StaggeredList,
// CountdownRing, CountUpNumber, NeuralNetworkLoader, SuccessCheckmark,
// PulseOnMount, ShimmerSlot). Reduced-motion replaces transforms with opacity
// fades automatically — primitives handle this themselves.
//
// Header padding uses var(--header-height) so nothing renders behind the
// fixed app header (contract §5.1).

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
import { SwipeableDriverDeck } from '@/components/blast/driver/swipeable-driver-deck';

interface DriverInfo {
  handle: string | null;
  displayName: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  vehicleLabel: string | null;
  vehicleColor: string | null;
  vehiclePhotoUrl: string | null;
  maxRiders: number | null;
  minimumFare: number | null;
  areaSlugs: string[];
  lgbtqFriendly: boolean;
  acceptsLongDistance: boolean;
  chillScore: number;
  completedRides: number;
  minRiderChillScore: number;
  tier: string | null;
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

interface FallbackDriver {
  targetId: string;
  driverId: string;
  matchScore: number;
  distanceFromPickupMi: number | null;
  distanceFromHomeMi: number | null;
  locationIsLive: boolean;
  homeLabel: string | null;
  driver: DriverInfo;
}

// FallbackDriver reuses DriverInfo shape — same fields.
interface Blast {
  id: string;
  status: 'active' | 'matched' | 'cancelled' | 'expired';
  price: number;
  expiresAt: string;
  pickup: { lat: number; lng: number; address: string | null };
  dropoff: { lat: number; lng: number; address: string | null };
  tripType: 'one_way' | 'round_trip';
  scheduledFor: string | null;
  storage: boolean;
  driverPreference: 'male' | 'female' | 'any';
  depositAmount: number;
  bumpCount: number;
}

const PER_TARGET_WINDOW_MS = 15 * 60_000;

// Track PostHog without taking a hard dependency in case it's not loaded.
function track(event: string, props?: Record<string, unknown>) {
  try {
    const ph = (globalThis as unknown as { posthog?: { capture: (e: string, p?: unknown) => void } }).posthog;
    if (ph && typeof ph.capture === 'function') ph.capture(event, props);
  } catch {
    // best-effort
  }
}

export default function BlastOfferBoardClientV3({
  blastId,
  shortcode,
}: {
  blastId: string;
  shortcode: string;
}) {
  const router = useRouter();
  const [blast, setBlast] = useState<Blast | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [fallback, setFallback] = useState<FallbackDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [pullingUpId, setPullingUpId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Initial fetch + soft 15s poll fallback (Ably is the primary live channel).
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/blast/${blastId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        blast: Blast;
        targets: Target[];
        fallbackDrivers: FallbackDriver[];
      };
      setBlast(data.blast);
      setTargets(data.targets);
      setFallback(data.fallbackDrivers ?? []);
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

  // Realtime — Ably pushes new HMU/counter/pass/etc on blast:{id}.
  useAbly({
    channelName: `blast:${blastId}`,
    blastId,
    onMessage: (msg) => {
      if (msg.name === 'target_hmu' || msg.name === 'target_counter') {
        const t = msg.data as Partial<Target> & { targetId?: string };
        if (!t.targetId) return;
        setTargets((prev) => {
          const idx = prev.findIndex((x) => x.targetId === t.targetId);
          // Build a partial-safe upsert: known fields from the wire payload,
          // existing fields preserved on update.
          if (idx === -1) return [...prev, t as Target];
          const next = [...prev];
          next[idx] = { ...next[idx], ...(t as Partial<Target>) };
          return next;
        });
      } else if (msg.name === 'target_pass') {
        const t = msg.data as { targetId?: string; passedAt?: string };
        if (!t.targetId) return;
        setTargets((prev) =>
          prev.map((x) => (x.targetId === t.targetId ? { ...x, passedAt: t.passedAt ?? new Date().toISOString() } : x)),
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
  const selectedTarget = useMemo(
    () => targets.find((t) => t.selectedAt && !t.rejectedAt) ?? null,
    [targets],
  );
  const notifiedCount = targets.filter((t) => t.notifiedAt).length;

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSelect = useCallback(
    async (target: Target) => {
      if (selectingId || pullingUpId) return;
      setSelectingId(target.targetId);
      // Optimistic — dim the others, scale-up this one (CSS handles via the
      // selectedTarget memo + className branch below).
      setTargets((prev) =>
        prev.map((t) =>
          t.targetId === target.targetId
            ? { ...t, selectedAt: new Date().toISOString() }
            : t,
        ),
      );
      const startedAt = Date.now();
      try {
        const res = await fetch(`/api/blast/${blastId}/select/${target.targetId}`, { method: 'POST' });
        const body = (await res.json().catch(() => ({}))) as {
          rideId?: string;
          error?: string;
          message?: string;
          returnUrl?: string;
        };
        if (res.ok) {
          track('blast_selected', {
            targetId: target.targetId,
            secondsToSelect: Math.round((Date.now() - startedAt) / 1000),
          });
          // Don't auto-route to the ride page — the v3 board waits here for
          // the rider to tap Pull Up. /select created the rides row + held
          // the deposit; pull-up will capture.
          await refresh();
          return;
        }
        if (res.status === 412 && body.error === 'PAYMENT_METHOD_REQUIRED') {
          const returnUrl = body.returnUrl ?? `/rider/blast/${shortcode}`;
          router.push(`/rider/settings?tab=payment&from=blast&returnUrl=${encodeURIComponent(returnUrl)}`);
          return;
        }
        // Roll back optimistic.
        setTargets((prev) => prev.map((t) => (t.targetId === target.targetId ? { ...t, selectedAt: null } : t)));
        setActionToast(body.message ?? body.error ?? 'Could not match');
      } finally {
        setSelectingId(null);
      }
    },
    [selectingId, pullingUpId, blastId, shortcode, router, refresh],
  );

  const handlePullUp = useCallback(
    async (target: Target) => {
      if (pullingUpId) return;
      setPullingUpId(target.targetId);
      try {
        const res = await fetch(`/api/blast/${blastId}/pull-up/${target.targetId}`, { method: 'POST' });
        const body = (await res.json().catch(() => ({}))) as {
          rideId?: string;
          error?: string;
          message?: string;
        };
        if (res.ok && body.rideId) {
          track('blast_pulled_up', { priceDollars: target.counterPrice ?? blast?.price ?? 0 });
          // 600ms hold for the success checkmark animation, then transition.
          window.setTimeout(() => router.push(`/ride/${body.rideId}`), 600);
          return;
        }
        setActionToast(body.message ?? body.error ?? 'Could not pull up');
      } finally {
        setPullingUpId(null);
      }
    },
    [pullingUpId, blastId, blast?.price, router],
  );

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this blast? Your hold will be released.')) return;
    track('blast_cancelled_by_rider', {
      stage: selectedTarget ? 'post_select' : 'pre_select',
    });
    await fetch(`/api/blast/${blastId}/cancel`, { method: 'POST' });
    router.push('/rider/browse/blast');
  }, [blastId, router, selectedTarget]);

  const handleDuplicate = useCallback(async () => {
    track('blast_duplicated', { sourceBlastId: blastId });
    const res = await fetch(`/api/blast/${blastId}/duplicate`, { method: 'POST' });
    if (!res.ok) {
      setActionToast('Could not duplicate this blast');
      return;
    }
    // Stream A's form will read the draft from URL state or sessionStorage.
    // We use sessionStorage so the form rehydrates without leaking it via URL.
    try {
      const data = (await res.json()) as { draft: unknown };
      sessionStorage.setItem('blast:draft:duplicated', JSON.stringify(data.draft));
    } catch {
      // best-effort
    }
    router.push('/rider/blast/new?from=duplicate');
  }, [blastId, router]);

  // ── Derived UI bits ────────────────────────────────────────────────────────

  const expiresAt = blast?.expiresAt ? new Date(blast.expiresAt).getTime() : null;
  const msLeft = expiresAt != null ? Math.max(0, expiresAt - now) : null;
  const totalMs = 15 * 60_000;
  const pctLeft = msLeft != null ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;

  // Skeleton shell appears within 100ms even if data is slow (contract §5.5).
  if (loading || !blast) {
    return (
      <div
        className="min-h-screen bg-black text-white"
        style={{ paddingTop: 'var(--header-height)' }}
      >
        <div className="px-4 pt-6 space-y-4">
          <ShimmerSlot width={160} height={24} radius={6} />
          <ShimmerSlot width={260} height={12} radius={6} />
          <ShimmerSlot width="100%" height={80} radius={16} />
          <ShimmerSlot width="100%" height={80} radius={16} />
        </div>
      </div>
    );
  }

  // Per-target countdown — converts remaining ms to seconds for CountdownRing.
  const perTargetSecondsLeft = (notifiedAtIso: string | null): number => {
    if (!notifiedAtIso) return PER_TARGET_WINDOW_MS / 1000;
    const elapsed = now - new Date(notifiedAtIso).getTime();
    const remaining = Math.max(0, PER_TARGET_WINDOW_MS - elapsed);
    return Math.floor(remaining / 1000);
  };

  return (
    <div
      className="min-h-screen bg-black text-white pb-20"
      style={{ paddingTop: 'var(--header-height)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="px-4 pt-4 pb-3">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <CountUpNumber value={blast.price} formatter={(n) => `$${Math.round(n)}`} /> ride
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5 truncate">
              {blast.pickup.address ?? 'pickup'} → {blast.dropoff.address ?? 'dropoff'}
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="text-xs text-neutral-500 hover:text-white px-2 py-1 rounded transition-colors"
            data-testid="blast-cancel"
          >
            Cancel
          </button>
        </div>
        {msLeft != null && interestedTargets.length > 0 && (
          <div className="mt-3 text-xs text-neutral-500">
            <span
              className="font-mono"
              style={{
                color:
                  pctLeft > 0.33 ? '#bbb' : pctLeft > 0.07 ? '#FFB300' : '#FF4444',
              }}
            >
              {Math.floor(msLeft / 60_000)}:
              {String(Math.floor((msLeft % 60_000) / 1000)).padStart(2, '0')}
            </span>{' '}
            until this offer board closes
          </div>
        )}
      </header>

      <main className="px-3 mt-2">
        {/* ── HMU'd section ──────────────────────────────────────────────── */}
        {interestedTargets.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 px-1 mb-3">
              HMU&rsquo;d ({interestedTargets.length})
            </h2>
            <StaggeredList staggerMs={80} as="ul" className="space-y-2">
              {interestedTargets.map((t) => {
                const isDimmed = selectedTarget && selectedTarget.targetId !== t.targetId;
                const isSelected = selectedTarget?.targetId === t.targetId;
                const counter = t.counterPrice && t.counterPrice !== blast.price;
                const secondsLeft = perTargetSecondsLeft(t.notifiedAt);
                return (
                  <motion.li
                    key={t.targetId}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{
                      opacity: isDimmed ? 0.4 : 1,
                      x: 0,
                      scale: isSelected ? 1.02 : 1,
                    }}
                    transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
                    className={`bg-neutral-900 border ${
                      isSelected ? 'border-[#00E676]' : 'border-neutral-800'
                    } rounded-2xl p-3 list-none`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-12 h-12 flex-shrink-0">
                        <CountdownRing
                          size={48}
                          strokeWidth={3}
                          secondsRemaining={secondsLeft}
                          totalSeconds={PER_TARGET_WINDOW_MS / 1000}
                        />
                        <div className="absolute inset-1 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center text-sm font-bold">
                          {t.driver.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={t.driver.thumbnailUrl}
                              alt={t.driver.displayName ?? t.driver.handle ?? 'Driver'}
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            (t.driver.displayName ?? t.driver.handle ?? '?')[0]?.toUpperCase()
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                          {t.driver.displayName ?? t.driver.handle ?? 'Driver'}
                          {t.driver.tier === 'hmu_first' && (
                            <span className="text-[9px] uppercase bg-amber-500/90 text-black px-1.5 rounded">
                              First
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          {Number.isFinite(t.driver.chillScore) && t.driver.chillScore > 0 && (
                            <span><span className="text-[#00E676] font-semibold">{Math.round(t.driver.chillScore)}%</span> chill</span>
                          )}
                          {t.driver.completedRides > 0 && (
                            <span><span className="text-white font-semibold">{t.driver.completedRides}</span> rides</span>
                          )}
                          {t.driver.vehicleLabel && (
                            <span className="text-neutral-600">🚗 {t.driver.vehicleLabel}</span>
                          )}
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
                          className="bg-white text-black text-sm font-bold px-4 py-2 rounded-xl disabled:bg-neutral-800 disabled:text-neutral-500 transition-colors min-w-[72px]"
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
                          className="bg-[#00E676] text-black text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60 transition-all min-w-[88px] flex items-center justify-center"
                        >
                          {pullingUpId === t.targetId ? (
                            <SuccessCheckmark size={20} autoHide={false} />
                          ) : (
                            'Pull Up'
                          )}
                        </motion.button>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </StaggeredList>
          </section>
        )}

        {/* ── Searching empty state ─────────────────────────────────────── */}
        {interestedTargets.length === 0 && (
          <section className="mt-4">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 px-1 mb-3">
              Searching
            </h2>
            <div className="rounded-2xl bg-neutral-900 border border-neutral-800 overflow-hidden">
              <NeuralNetworkLoader
                label={
                  notifiedCount > 0
                    ? `Notifying ${notifiedCount} driver${notifiedCount === 1 ? '' : 's'} near you…`
                    : 'Scanning your area for drivers…'
                }
              />
            </div>
          </section>
        )}

        {/* ── More options — swipeable driver deck ──────────────────────── */}
        {fallback.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 px-1 mb-3">
              Nearby Drivers
            </h2>
            <p className="text-xs text-neutral-500 mb-3 px-1">
              Swipe right to HMU, left to pass. Tap an action button if you prefer.
            </p>
            <SwipeableDriverDeck
              blastId={blastId}
              cards={fallback}
              blastPrice={blast.price}
              depositAmount={blast.depositAmount}
              onAfterHmu={refresh}
            />
          </section>
        )}

        {/* ── Send another blast CTA ────────────────────────────────────── */}
        <div className="mt-6 px-1">
          <button
            onClick={handleDuplicate}
            className="w-full text-sm text-neutral-400 hover:text-white py-3 border border-neutral-800 rounded-2xl transition-colors"
          >
            Send another blast (start with these details)
          </button>
        </div>
      </main>

      {/* ── Action toast ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {actionToast && (
          <ToastShim message={actionToast} onTimeout={() => setActionToast(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// Toast shim — uses PulseOnMount for the entrance pulse and an effect to
// schedule auto-dismiss. Kept inline so we don't introduce a new shared
// toast component just for the offer board.
function ToastShim({ message, onTimeout }: { message: string; onTimeout: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onTimeout, 2400);
    return () => window.clearTimeout(t);
  }, [onTimeout]);
  return (
    <PulseOnMount>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50">
        {message}
      </div>
    </PulseOnMount>
  );
}
