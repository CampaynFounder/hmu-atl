'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAbly } from '@/hooks/use-ably';

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

  // Live updates via Ably.
  useAbly({
    channelName: `blast:${blastId}`,
    blastId,
    onMessage: (msg) => {
      if (msg.name === 'target_hmu' || msg.name === 'bumped' || msg.name === 'match_locked' || msg.name === 'cancelled') {
        // Cheap path: re-fetch the whole state. Cards will glide-in from the
        // diff in setTargets below.
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
      {/* Countdown bar */}
      <div className="h-1 w-full bg-neutral-900 sticky top-0 z-30">
        <div
          className={`h-full ${countdownColor} transition-[width] duration-1000 ease-linear`}
          style={{ width: `${pctLeft * 100}%` }}
        />
      </div>

      <header className="px-4 py-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-lg font-bold">${blast.price} ride</h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              {blast.pickup.address ?? 'pickup'} → {blast.dropoff.address ?? 'dropoff'}
            </p>
          </div>
          <button onClick={handleCancel} className="text-xs text-neutral-500 hover:text-white">
            Cancel
          </button>
        </div>
        <div className="text-[11px] text-neutral-600 mt-2">
          {msLeft && msLeft > 0
            ? `${minutesLeft}:${String(secondsLeft).padStart(2, '0')} left`
            : 'Time’s up'}
        </div>
      </header>

      <main className="px-3 mt-2">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 px-1 mb-3">
          Drivers reaching out
        </h2>

        {interestedTargets.length === 0 ? (
          <div className="rounded-2xl bg-neutral-900 border border-neutral-800 px-4 py-12 text-center">
            <div className="text-3xl animate-pulse">·····</div>
            <div className="text-sm text-neutral-400 mt-3">
              {targets.length === 0
                ? 'Hunting for drivers near you…'
                : `Pinged ${targets.length} driver${targets.length === 1 ? '' : 's'} — waiting for a HMU back…`}
            </div>
          </div>
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

      {/* No-match fallback modal */}
      {showFallback && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-end">
          <div className="w-full bg-neutral-900 rounded-t-3xl p-6 motion-safe:animate-[slideUp_300ms_ease-out]">
            <h3 className="text-lg font-bold">No drivers picked up</h3>
            <p className="text-sm text-neutral-400 mt-1">Try one of these:</p>
            <div className="grid grid-cols-3 gap-2 mt-4">
              {[5, 10, 20].map((d) => (
                <button
                  key={d}
                  onClick={() => handleBump(d)}
                  disabled={bumping}
                  className="bg-neutral-800 hover:bg-neutral-700 py-3 rounded-xl text-sm font-medium"
                >
                  +${d}
                </button>
              ))}
            </div>
            <button
              onClick={handleCancel}
              className="w-full mt-3 text-sm text-neutral-500 hover:text-white py-2"
            >
              Cancel & refund
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
