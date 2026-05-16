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
import dynamic from 'next/dynamic';
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

// InlinePaymentForm uses @stripe/react-stripe-js — dynamic import keeps it
// out of the initial bundle and avoids SSR issues.
const InlinePaymentForm = dynamic(
  () => import('@/components/payments/inline-payment-form'),
  { ssr: false, loading: () => (
    <div style={{ padding: 16, textAlign: 'center', color: '#888', fontSize: 13 }}>
      Loading secure payment…
    </div>
  )},
);

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
  /** Per-driver response window in ms — from admin config, default 15 min. */
  targetWindowMs: number;
}

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

  // Payment gate — first 3 fallback drivers are free; rest require a card.
  const [hasCard, setHasCard] = useState<boolean | null>(null); // null = loading
  const [showCardForm, setShowCardForm] = useState(false);
  const FREE_DRIVER_LIMIT = 3;

  // Review mode — toggled after rider exhausts the swipe deck or explicitly opens it.
  const [showReview, setShowReview] = useState(false);

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

  // Check if rider has a saved payment method once on mount.
  useEffect(() => {
    fetch('/api/rider/payment-methods')
      .then((r) => r.json())
      .then((d: { methods?: unknown[] }) => setHasCard((d.methods?.length ?? 0) > 0))
      .catch(() => setHasCard(false));
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

  const targetWindowMs = blast?.targetWindowMs ?? 15 * 60_000;

  // Per-target countdown — uses admin-configurable window from blast config.
  const perTargetSecondsLeft = (notifiedAtIso: string | null): number => {
    if (!notifiedAtIso) return targetWindowMs / 1000;
    const elapsed = now - new Date(notifiedAtIso).getTime();
    const remaining = Math.max(0, targetWindowMs - elapsed);
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
                          totalSeconds={targetWindowMs / 1000}
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

        {/* ── Searching state — compact panoramic map banner ───────────── */}
        {interestedTargets.length === 0 && (
          <section className="mt-4">
            <div className="rounded-2xl overflow-hidden" style={{ marginBottom: 12 }}>
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

        {/* ── Nearby drivers — swipeable deck ──────────────────────────── */}
        {fallback.length > 0 && !showReview && (
          <section className="mt-4">
            {/* Free tier: first 3 drivers, no card needed */}
            <SwipeableDriverDeck
              blastId={blastId}
              cards={hasCard ? fallback : fallback.slice(0, FREE_DRIVER_LIMIT)}
              blastPrice={blast.price}
              depositAmount={blast.depositAmount}
              onAfterHmu={refresh}
              onDeckEmpty={() => setShowReview(true)}
            />

            {/* Payment gate — shown when rider has no card + more drivers exist */}
            <AnimatePresence>
              {!hasCard && fallback.length > FREE_DRIVER_LIMIT && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4"
                >
                  {!showCardForm ? (
                    <button
                      onClick={() => setShowCardForm(true)}
                      className="w-full rounded-2xl border border-[#00E676]/30 bg-[#00E676]/5 p-4 text-left transition-all hover:bg-[#00E676]/10"
                    >
                      <div className="text-sm font-bold text-white mb-0.5">
                        {fallback.length - FREE_DRIVER_LIMIT} more drivers nearby
                      </div>
                      <div className="text-xs text-neutral-400">
                        Link your card to see them — no charge until you ride.
                      </div>
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#00E676] px-4 py-2 text-xs font-bold text-black">
                        Link card to unlock
                      </div>
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-white">
                          Link your card
                        </span>
                        <button
                          onClick={() => setShowCardForm(false)}
                          className="text-neutral-500 hover:text-white text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-xs text-neutral-500 mb-4">
                        No charge now — only charged when a ride completes.
                        Unlocks {fallback.length - FREE_DRIVER_LIMIT} more drivers.
                      </p>
                      <InlinePaymentForm
                        compact
                        onSuccess={() => {
                          setHasCard(true);
                          setShowCardForm(false);
                          track('blast_card_linked', { blastId, extraDrivers: fallback.length - FREE_DRIVER_LIMIT });
                        }}
                        onCancel={() => setShowCardForm(false)}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* ── Matching review — post-swipe session ─────────────────────── */}
        {(showReview || (interestedTargets.length > 0 && fallback.length === 0)) && (
          <MatchReviewSection
            targets={targets}
            notifiedCount={notifiedCount}
            now={now}
            targetWindowMs={targetWindowMs}
            blastPrice={blast.price}
            selectingId={selectingId}
            pullingUpId={pullingUpId}
            selectedTarget={selectedTarget}
            onSelect={handleSelect}
            onPullUp={handlePullUp}
            onShowAll={() => setShowReview(false)}
          />
        )}

        {/* ── Send another blast ────────────────────────────────────────── */}
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

// ── Matching review section ───────────────────────────────────────────────────
// Shows after the rider finishes swiping. Lists only drivers who responded
// (HMU'd, countered) — never shows drivers who passed. Pending count shown
// separately with a blast-level countdown so the rider knows when the window
// closes.

function MatchReviewSection({
  targets,
  notifiedCount,
  now,
  targetWindowMs,
  blastPrice,
  selectingId,
  pullingUpId,
  selectedTarget,
  onSelect,
  onPullUp,
  onShowAll,
}: {
  targets: Target[];
  notifiedCount: number;
  now: number;
  targetWindowMs: number;
  blastPrice: number;
  selectingId: string | null;
  pullingUpId: string | null;
  selectedTarget: Target | null;
  onSelect: (t: Target) => void;
  onPullUp: (t: Target) => void;
  onShowAll: () => void;
}) {
  // Responded = HMU'd back or countered, not passed, not rejected
  const responded = targets.filter(
    (t) => t.hmuAt && !t.passedAt && !t.rejectedAt,
  );
  // Pending = notified but no response yet (no hmu, no pass, no reject)
  const pending = targets.filter(
    (t) => t.notifiedAt && !t.hmuAt && !t.passedAt && !t.rejectedAt,
  );

  const formatCountdown = (ms: number) => {
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between px-1 mb-3">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500">
          Your matches
        </h2>
        {pending.length > 0 && (
          <button onClick={onShowAll} className="text-xs text-neutral-500 hover:text-white transition-colors">
            ← back to deck
          </button>
        )}
      </div>

      {responded.length === 0 && (
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6 text-center">
          <p className="text-sm text-neutral-400">No responses yet.</p>
          {pending.length > 0 && (
            <p className="text-xs text-neutral-600 mt-1">
              {pending.length} driver{pending.length === 1 ? '' : 's'} still deciding…
            </p>
          )}
        </div>
      )}

      {responded.length > 0 && (
        <StaggeredList staggerMs={60} as="ul" className="space-y-2">
          {responded.map((t) => {
            const counter = t.counterPrice != null && t.counterPrice !== blastPrice;
            const isSelected = selectedTarget?.targetId === t.targetId;
            const isDimmed = selectedTarget && !isSelected;
            const windowRemaining = t.notifiedAt
              ? Math.max(0, targetWindowMs - (now - new Date(t.notifiedAt).getTime()))
              : targetWindowMs;
            const distanceLabel = (() => {
              const d = (t as unknown as Record<string, unknown>);
              if (d.distanceFromPickupMi != null) return `${d.distanceFromPickupMi} mi`;
              return null;
            })();

            return (
              <motion.li
                key={t.targetId}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: isDimmed ? 0.4 : 1, x: 0, scale: isSelected ? 1.01 : 1 }}
                transition={{ duration: 0.2 }}
                className={`rounded-2xl border p-3 list-none ${isSelected ? 'border-[#00E676] bg-[#00E676]/5' : 'border-neutral-800 bg-neutral-900'}`}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar with countdown ring */}
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <CountdownRing
                      size={48}
                      strokeWidth={3}
                      secondsRemaining={Math.floor(windowRemaining / 1000)}
                      totalSeconds={targetWindowMs / 1000}
                    />
                    <div className="absolute inset-1 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center text-sm font-bold">
                      {t.driver.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.driver.thumbnailUrl} alt="" className="w-full h-full object-cover object-top" />
                      ) : (
                        (t.driver.displayName ?? t.driver.handle ?? '?')[0]?.toUpperCase()
                      )}
                    </div>
                  </div>

                  {/* Driver info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {t.driver.displayName ?? t.driver.handle ?? 'Driver'}
                      {t.driver.tier === 'hmu_first' && (
                        <span className="text-[9px] uppercase bg-amber-500/90 text-black px-1.5 rounded">1st</span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {t.driver.chillScore > 0 && (
                        <span><span className="text-[#00E676] font-semibold">{Math.round(t.driver.chillScore)}%</span> chill</span>
                      )}
                      {t.driver.vehicleLabel && <span className="text-neutral-600">🚗 {t.driver.vehicleLabel}</span>}
                      {distanceLabel && <span>{distanceLabel}</span>}
                      {counter && (
                        <span className="text-amber-400">
                          ${t.counterPrice} counter
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-600 mt-0.5">
                      Window closes {formatCountdown(windowRemaining)}
                    </div>
                  </div>

                  {/* Action */}
                  {!selectedTarget && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onSelect(t)}
                      disabled={selectingId != null}
                      className="bg-white text-black text-sm font-bold px-4 py-2 rounded-xl disabled:bg-neutral-800 disabled:text-neutral-500 min-w-[72px]"
                    >
                      {selectingId === t.targetId ? '…' : 'Select'}
                    </motion.button>
                  )}
                  {isSelected && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onPullUp(t)}
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
      )}

      {/* Pending count — shows how many drivers haven't responded yet */}
      {pending.length > 0 && (
        <div className="mt-3 rounded-xl bg-neutral-900/60 border border-neutral-800 px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-neutral-500 animate-pulse flex-shrink-0" />
          <p className="text-xs text-neutral-400">
            <span className="text-white font-semibold">{pending.length}</span> driver{pending.length === 1 ? '' : 's'} still deciding — window closes{' '}
            {notifiedCount > 0 && pending[0]?.notifiedAt ? (
              <span className="font-mono text-neutral-300">
                {formatPendingCountdown(
                  Math.max(0, targetWindowMs - (now - new Date(pending[0].notifiedAt).getTime()))
                )}
              </span>
            ) : 'soon'}
          </p>
        </div>
      )}
    </section>
  );
}

function formatPendingCountdown(ms: number) {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
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
