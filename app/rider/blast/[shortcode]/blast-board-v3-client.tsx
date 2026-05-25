'use client';

// /rider/blast/[shortcode] — swipe deck (primary action surface).
//
// Riders see matched drivers as full-bleed cards and swipe:
//   right = HMU (contact that driver — payment gate if no card linked)
//   left  = Nah (dismiss, driver is never contacted)
//
// After ≥1 right swipe a sticky CTA links to the status board at
// /rider/blast/[shortcode]/status where the rider tracks responses.
// Ably subscription keeps the contacted-driver count live.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAbly } from '@/hooks/use-ably';
import { NeuralNetworkLoader, ShimmerSlot } from '@/components/blast/motion';
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

interface FallbackDriver {
  targetId: string;
  driverId: string;
  matchScore: number;
  distanceFromPickupMi: number | null;
  distanceTier: 'live' | 'last_known' | 'home' | null;
  driver: DriverInfo;
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
  depositAmount: number;
}

function track(event: string, props?: Record<string, unknown>) {
  try {
    const ph = (globalThis as unknown as { posthog?: { capture: (e: string, p?: unknown) => void } }).posthog;
    if (ph && typeof ph.capture === 'function') ph.capture(event, props);
  } catch { /* best-effort */ }
}

export default function BlastSwipeDeckClient({
  blastId,
  shortcode,
}: {
  blastId: string;
  shortcode: string;
}) {
  const router = useRouter();
  const [blast, setBlast] = useState<Blast | null>(null);
  const [fallback, setFallback] = useState<FallbackDriver[]>([]);
  const [contactedCount, setContactedCount] = useState(0); // targets with notified_at set
  const [loading, setLoading] = useState(true);
  const [hasCard, setHasCard] = useState<boolean | null>(null);
  const [dismissedFallbackIds, setDismissedFallbackIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/blast/${blastId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        blast: Blast;
        targets: unknown[];
        fallbackDrivers: FallbackDriver[];
      };
      setBlast(data.blast);
      setFallback(data.fallbackDrivers ?? []);
      setContactedCount(data.targets?.length ?? 0);
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
    fetch('/api/rider/payment-methods')
      .then((r) => r.json())
      .then((d: { methods?: unknown[] }) => setHasCard((d.methods?.length ?? 0) > 0))
      .catch(() => setHasCard(false));
  }, []);

  useAbly({
    channelName: `blast:${blastId}`,
    blastId,
    onMessage: (msg) => {
      if (
        msg.name === 'blast_cancelled' ||
        msg.name === 'blast_bumped' ||
        msg.name === 'target_notified'
      ) {
        void refresh();
      }
    },
  });

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this blast?')) return;
    track('blast_cancelled_by_rider', { blastId });
    await fetch(`/api/blast/${blastId}/cancel`, { method: 'POST' });
    router.push('/rider/browse/blast');
  }, [blastId, router]);

  const visibleDeck = useMemo(
    () => fallback.filter((c) => !dismissedFallbackIds.has(c.targetId)),
    [fallback, dismissedFallbackIds],
  );

  if (loading || !blast) {
    return (
      <div className="min-h-screen bg-black text-white" style={{ paddingTop: 'var(--header-height)' }}>
        <div className="px-4 pt-6 space-y-4">
          <ShimmerSlot width={160} height={24} radius={6} />
          <ShimmerSlot width={260} height={12} radius={6} />
          <ShimmerSlot width="100%" height={480} radius={24} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-black text-white pb-24"
      style={{ paddingTop: 'var(--header-height)' }}
    >
      {/* ── Header ── */}
      <header className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white leading-tight">
            ${blast.price} · {blast.pickup.address?.split(',')[0] ?? 'pickup'} → {blast.dropoff.address?.split(',')[0] ?? 'dropoff'}
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {blast.tripType === 'round_trip' ? 'Round trip' : 'One way'}
            {blast.scheduledFor ? ` · Scheduled` : ' · ASAP'}
          </p>
        </div>
        <button
          onClick={handleCancel}
          className="text-xs text-neutral-500 hover:text-white px-2 py-1 rounded transition-colors flex-shrink-0"
        >
          Cancel
        </button>
      </header>

      {/* ── Status CTA — appears once the rider has contacted ≥1 driver ── */}
      <AnimatePresence>
        {contactedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-3 mb-3"
          >
            <button
              onClick={() => router.push(`/rider/blast/${shortcode}/status`)}
              className="w-full flex items-center justify-between bg-[#00E676]/10 border border-[#00E676]/30 rounded-2xl px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
                <span className="text-sm font-semibold text-[#00E676]">
                  {contactedCount} driver{contactedCount === 1 ? '' : 's'} contacted
                </span>
              </div>
              <span className="text-xs text-[#00E676]/70">View Status →</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Swipe deck ── */}
      <main className="px-3">
        {visibleDeck.length === 0 && !loading ? (
          <div className="rounded-2xl overflow-hidden">
            <NeuralNetworkLoader
              label={
                contactedCount > 0
                  ? 'You\'ve seen everyone — check your status board'
                  : 'Scanning your area for drivers…'
              }
            />
            {contactedCount > 0 && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => router.push(`/rider/blast/${shortcode}/status`)}
                  className="rounded-full bg-[#00E676] text-black text-sm font-bold px-6 py-3"
                >
                  View Blast Status
                </button>
              </div>
            )}
          </div>
        ) : (
          <SwipeableDriverDeck
            blastId={blastId}
            cards={fallback}
            blastPrice={blast.price}
            depositAmount={blast.depositAmount}
            hasCard={hasCard === true}
            externalDismissedIds={dismissedFallbackIds}
            onDismissed={(id) =>
              setDismissedFallbackIds((prev) => {
                const next = new Set(prev);
                next.add(id);
                return next;
              })
            }
            onAfterHmu={() => {
              setContactedCount((n) => n + 1);
              track('blast_hmu_sent', { blastId });
              void refresh();
            }}
            onExpanded={() => {
              setHasCard(true);
              void refresh();
            }}
          />
        )}
      </main>
    </div>
  );
}
