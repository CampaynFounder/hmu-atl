'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAbly } from '@/hooks/use-ably';
import { motion, AnimatePresence } from 'framer-motion';

interface Target {
  targetId: string;
  driverId: string;
  matchScore: number;
  hmuAt: string | null;
  counterPrice: number | null;
  passedAt: string | null;
  selectedAt: string | null;
  rejectedAt: string | null;
  driver: {
    handle: string | null;
    displayName: string | null;
    videoUrl: string | null;
    vehicle: Record<string, unknown> | null;
    chillScore: number;
    tier: 'free' | 'hmu_first';
  };
}

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

export default function BlastOfferBoardClient({ blastId }: { blastId: string }) {
  const router = useRouter();
  const [blast, setBlast] = useState<Blast | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState<string | null>(null);
  const [bumping, setBumping] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [searchStage, setSearchStage] = useState(0);

  // Initial fetch + soft poll fallback (Ably is the primary live channel).
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/blast/${blastId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { blast: Blast; targets: Target[] };
      setBlast(data.blast);
      setTargets(data.targets);
    } finally {
      setLoading(false);
    }
  }, [blastId]);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Live updates via Ably - optimistic driver loading.
  useAbly({
    channelName: `blast:${blastId}`,
    blastId,
    onMessage: (msg) => {
      if (msg.name === 'target_hmu') {
        // Optimistic append: add the new driver immediately without page refresh
        const newTarget = msg.data as Target;
        setTargets((prev) => {
          const exists = prev.some((t) => t.targetId === newTarget.targetId);
          if (exists) return prev;
          return [...prev, newTarget];
        });
      } else if (msg.name === 'match_locked' || msg.name === 'cancelled' || msg.name === 'bumped') {
        // Full re-fetch for state changes
        refresh();
      }
    },
  });

  const interestedTargets = useMemo(
    () => targets.filter((t) => t.hmuAt && !t.rejectedAt && !t.passedAt),
    [targets],
  );

  // Countdown.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const expiresAt = blast?.expiresAt ? new Date(blast.expiresAt).getTime() : null;
  const msLeft = expiresAt != null ? Math.max(0, expiresAt - now) : null;
  const totalMs = expiresAt != null && blast ? 15 * 60_000 : 1; // assume 15min default; close enough for UI
  const pctLeft = msLeft != null ? Math.max(0, Math.min(1, msLeft / totalMs)) : 0;

  // Rotate search stage animation
  useEffect(() => {
    if (interestedTargets.length === 0 && blast?.status === 'active') {
      const t = window.setInterval(() => setSearchStage((s) => (s + 1) % 3), 3000);
      return () => window.clearInterval(t);
    }
  }, [interestedTargets.length, blast?.status]);

  useEffect(() => {
    if (msLeft === 0 && interestedTargets.length === 0 && blast?.status === 'active') {
      setShowFallback(true);
    }
  }, [msLeft, interestedTargets.length, blast?.status]);

  // Once matched, redirect to the ride page.
  useEffect(() => {
    if (blast?.status === 'matched') {
      const selected = targets.find((t) => t.selectedAt);
      // The select API returns the rideId. We'll re-query the rides table on
      // status=matched via a synthetic call.
      // Simpler: hop to /rider/rides — they'll see the new ride at the top.
      // For better UX, the select handler should set the rideId in URL state;
      // here we just hop.
      void selected;
      router.push('/rider/rides');
    }
  }, [blast?.status, targets, router]);

  const handleSelect = useCallback(
    async (target: Target) => {
      if (matching) return;
      setMatching(target.targetId);
      try {
        const res = await fetch(`/api/blast/${blastId}/select/${target.targetId}`, { method: 'POST' });
        const body = (await res.json().catch(() => ({}))) as {
          rideId?: string;
          error?: string;
          message?: string;
          returnUrl?: string;
        };
        if (res.ok && body.rideId) {
          router.push(`/ride/${body.rideId}`);
          return;
        }
        // Lax-creation model: card collection happens at match-acceptance.
        // First match tap from a brand-new funnel rider lands here — bounce
        // them to settings to add a card, then back to this offer board to
        // re-tap Match.
        if (res.status === 412 && body.error === 'PAYMENT_METHOD_REQUIRED') {
          const returnUrl = body.returnUrl ?? `/rider/blast/${blastId}`;
          router.push(`/rider/settings?tab=payment&from=blast&returnUrl=${encodeURIComponent(returnUrl)}`);
          return;
        }
        alert(body.message || body.error || 'Could not match. Try another driver.');
      } finally {
        setMatching(null);
      }
    },
    [matching, blastId, router],
  );

  const handleBump = useCallback(async (additional: number) => {
    if (bumping) return;
    setBumping(true);
    try {
      await fetch(`/api/blast/${blastId}/bump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additional_dollars: additional }),
      });
      await refresh();
      setShowFallback(false);
    } finally {
      setBumping(false);
    }
  }, [blastId, bumping, refresh]);

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this blast? Your deposit will be released.')) return;
    await fetch(`/api/blast/${blastId}/cancel`, { method: 'POST' });
    router.push('/rider/browse/blast');
  }, [blastId, router]);

  if (loading || !blast) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading…</div>;
  }

  const minutesLeft = msLeft != null ? Math.floor(msLeft / 60_000) : 0;
  const secondsLeft = msLeft != null ? Math.floor((msLeft % 60_000) / 1000) : 0;
  const countdownColor = pctLeft > 0.33 ? 'bg-white' : pctLeft > 0.07 ? 'bg-amber-400' : 'bg-red-500';

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Countdown bar - only show after first driver HMU */}
      {interestedTargets.length > 0 && (
        <div className="h-1 w-full bg-neutral-900 sticky top-0 z-30">
          <div
            className={`h-full ${countdownColor} transition-[width] duration-1000 ease-linear`}
            style={{ width: `${pctLeft * 100}%` }}
          />
        </div>
      )}

      <header className="px-4 pt-6 pb-4">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold">${blast.price} ride</h1>
            <p className="text-xs text-neutral-400 mt-0.5 truncate">
              {blast.pickup.address ?? 'pickup'} → {blast.dropoff.address ?? 'dropoff'}
            </p>
          </div>
          <button onClick={handleCancel} className="text-xs text-neutral-500 hover:text-white ml-3 flex-shrink-0">
            Cancel
          </button>
        </div>
        {/* Countdown timer - only show after first driver HMU */}
        {interestedTargets.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div
              className="text-3xl font-bold tabular-nums transition-colors duration-300"
              style={{
                fontFamily: 'var(--font-display)',
                color: pctLeft > 0.33 ? '#ffffff' : pctLeft > 0.07 ? '#fbbf24' : '#ef4444',
              }}
            >
              {msLeft && msLeft > 0
                ? `${minutesLeft}:${String(secondsLeft).padStart(2, '0')}`
                : '0:00'}
            </div>
            <div className="text-xs text-neutral-500">left</div>
          </div>
        )}
      </header>

      <main className="px-3 mt-2">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 px-1 mb-3">
          Drivers reaching out
        </h2>

        {interestedTargets.length === 0 ? (
          <DriverSearchAnimation stage={searchStage} targetsNotified={targets.length} />
        ) : (
          <ul className="space-y-2">
            {interestedTargets.map((t, i) => {
              const counter = t.counterPrice && t.counterPrice !== blast.price;
              return (
                <li
                  key={t.targetId}
                  className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 motion-safe:animate-[slideInRight_280ms_ease-out_both]"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-base font-bold flex-shrink-0">
                      {(t.driver.displayName ?? t.driver.handle ?? '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                        {t.driver.displayName ?? t.driver.handle}
                        {t.driver.tier === 'hmu_first' && (
                          <span className="text-[9px] uppercase bg-amber-500/90 text-black px-1.5 rounded">
                            First
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500 mt-0.5 flex gap-2">
                        {Number.isFinite(t.driver.chillScore) && t.driver.chillScore > 0 && (
                          <span>✅ {Math.round(t.driver.chillScore)}%</span>
                        )}
                        {counter && (
                          <span className="text-amber-400">Counters: ${t.counterPrice}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleSelect(t)}
                      disabled={matching != null}
                      className="bg-white text-black text-sm font-bold px-4 py-2 rounded-xl disabled:bg-neutral-800 disabled:text-neutral-500 transition-colors"
                    >
                      {matching === t.targetId ? '…' : 'Match'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Subtle bump prompt at 5min in */}
        {msLeft != null && msLeft < 10 * 60_000 && interestedTargets.length === 0 && !showFallback && (
          <div className="mt-4 text-center">
            <button
              onClick={() => handleBump(5)}
              disabled={bumping}
              className="text-xs text-neutral-500 underline hover:text-white"
            >
              Haven&rsquo;t heard back? Try +$5
            </button>
          </div>
        )}
      </main>

      {/* Enhanced no-match fallback modal with coaching */}
      {showFallback && blast && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-end"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full bg-neutral-900 rounded-t-3xl p-6"
          >
            <h3 className="text-lg font-bold">No drivers available yet</h3>
            <p className="text-sm text-neutral-400 mt-1">
              We checked {targets.length} driver{targets.length === 1 ? '' : 's'} in your area.
              {blast.driverPreference !== 'any' && ' Your gender preference may have limited matches.'}
              {blast.price < 20 && ' Low price may have deterred drivers.'}
              {blast.storage && ' Storage request may have limited options.'}
            </p>
            <p className="text-xs text-neutral-500 mt-2">
              Try increasing your price — drivers may adjust for gas costs.
            </p>

            {/* Quick expand controls */}
            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Expand your search</div>

              {/* Price bump with animated options */}
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 20].map((d, i) => (
                  <motion.button
                    key={d}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleBump(d)}
                    disabled={bumping}
                    className="bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    +${d}
                  </motion.button>
                ))}
              </div>

              {/* One-button expand driver preference */}
              {blast.driverPreference !== 'any' && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    // TODO: implement expand preference API call
                    handleBump(0); // Placeholder - re-run matching with 'any' preference
                  }}
                  disabled={bumping}
                  className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 py-3 rounded-xl text-sm font-medium transition-colors"
                >
                  Include all drivers (remove {blast.driverPreference === 'male' ? 'men-only' : 'women-only'} filter)
                </motion.button>
              )}
            </div>

            <button
              onClick={handleCancel}
              className="w-full mt-4 text-sm text-neutral-500 hover:text-white py-2"
            >
              Cancel & refund
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

// ── Driver Search Animation Component ──────────────────────────────────────

function DriverSearchAnimation({ stage, targetsNotified }: { stage: number; targetsNotified: number }) {
  const stages = [
    { icon: '🔍', text: 'Checking your preferences…', subtext: 'Finding drivers who match your criteria' },
    { icon: '📍', text: 'Finding drivers nearby…', subtext: 'Scanning the area for available drivers' },
    { icon: '💰', text: 'Comparing prices…', subtext: 'Matching you with the best options' },
  ];
  const { icon, text, subtext } = stages[stage % stages.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-neutral-900 border border-neutral-800 px-4 py-12 text-center"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-5xl mb-4"
          >
            {icon}
          </motion.div>
          <div className="text-base text-white font-medium mb-2">{text}</div>
          <div className="text-xs text-neutral-500">{subtext}</div>
        </motion.div>
      </AnimatePresence>

      {targetsNotified > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-4 text-xs text-neutral-400"
        >
          Pinged {targetsNotified} driver{targetsNotified === 1 ? '' : 's'} — waiting for responses…
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-6 flex justify-center gap-1"
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.2,
            }}
            className="w-2 h-2 rounded-full bg-neutral-600"
          />
        ))}
      </motion.div>
    </motion.div>
  );
}
