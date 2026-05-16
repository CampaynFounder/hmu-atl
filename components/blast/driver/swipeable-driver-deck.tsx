'use client';

// SwipeableDriverDeck — Tinder-style stack of fallback driver cards rendered
// on the rider's offer board. Replaces the linear "More options" list.
//
// Mechanics
//   - Top card is draggable on the x-axis. Right swipe = HMU (notify that
//     driver directly). Left swipe = pass (record a fallback_dismissed event
//     so we don't keep re-surfacing them on poll cycles).
//   - The HMU button on the card mirrors swipe-right for accessibility +
//     discoverability — first-time riders shouldn't have to guess the gesture.
//   - Either action triggers a 3-second Undo toast. Undo reverses the just-
//     performed action by hitting the matching DELETE/POST and pushes the
//     card back onto the deck. The toast auto-dismisses after 3s without
//     touching the card again.
//   - Below the top card we render up to two more cards at reduced scale +
//     y-offset so the deck visibly has depth.
//
// Driver-side flow is unchanged. The pass endpoint records the dismissal in
// blast_driver_events (event_type='fallback_dismissed', source='rider_action')
// and the offer-board GET filters those out with a NOT EXISTS subquery.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';
import { SwipeableCard } from '@/components/blast/motion';

const UNDO_WINDOW_MS = 3000;

export interface FallbackDriverCardData {
  targetId: string;
  driverId: string;
  matchScore: number;
  /** Pickup → driver's *current* (or home, if GPS stale) location. */
  distanceFromPickupMi: number | null;
  /** Pickup → driver's home base. Null if the driver hasn't set a home. */
  distanceFromHomeMi: number | null;
  /** True when distanceFromPickupMi was computed from fresh GPS, not home. */
  locationIsLive: boolean;
  /** Driver's home label (e.g. "Decatur, GA"). Null if not set. */
  homeLabel: string | null;
  driver: {
    handle: string | null;
    displayName: string | null;
    videoUrl: string | null;
    vehicle: Record<string, unknown> | null;
    chillScore: number;
    tier: string | null;
  };
}

interface SwipeableDriverDeckProps {
  blastId: string;
  cards: FallbackDriverCardData[];
  /** Called after a non-undone HMU completes so the parent can re-fetch. */
  onAfterHmu?: () => void;
  /** Called after a non-undone pass completes — usually a no-op (the next
   *  poll cycle already filters dismissed targets) but exposed for tests. */
  onAfterPass?: () => void;
}

type PendingAction =
  | { type: 'hmu'; card: FallbackDriverCardData; expiresAt: number }
  | { type: 'pass'; card: FallbackDriverCardData; expiresAt: number };

export function SwipeableDriverDeck({
  blastId,
  cards,
  onAfterHmu,
  onAfterPass,
}: SwipeableDriverDeckProps) {
  const prefersReduced = useReducedMotion();
  // We don't mirror `cards` into local state. Instead we keep:
  //   - `pending`        → the just-swiped action awaiting commit-or-undo
  //   - `dismissedIds`   → targets the rider has finalized as pass-or-HMU,
  //                        so they stay hidden through the brief window
  //                        between local commit and the parent's next poll
  // and derive what the deck shows from those + the parent's `cards` prop.
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());

  // Cards visible right now = parent list minus already-committed and
  // minus the currently-pending card.
  const deck = useMemo(() => {
    return cards.filter(
      (c) => !dismissedIds.has(c.targetId) && c.targetId !== pending?.card.targetId,
    );
  }, [cards, dismissedIds, pending]);

  // Commit timer — once the undo window elapses, the action is final. We
  // move the card from `pending` into `dismissedIds` (so it stays hidden
  // even if the parent's next poll still contains it) and fire the
  // appropriate after-callback so the parent can refresh.
  useEffect(() => {
    if (!pending) return;
    const remaining = Math.max(0, pending.expiresAt - Date.now());
    const t = setTimeout(() => {
      const committed = pending;
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(committed.card.targetId);
        return next;
      });
      setPending(null);
      if (committed.type === 'hmu') onAfterHmu?.();
      else onAfterPass?.();
    }, remaining);
    return () => clearTimeout(t);
  }, [pending, onAfterHmu, onAfterPass]);

  const handleHmu = useCallback(
    (card: FallbackDriverCardData) => {
      setPending({ type: 'hmu', card, expiresAt: Date.now() + UNDO_WINDOW_MS });
      void fetch(`/api/blast/${blastId}/hmu-fallback/${card.targetId}`, {
        method: 'POST',
      }).catch(() => { /* swallowed — UI already optimistic; next poll will reflect actual state */ });
      try {
        posthog.capture('blast_fallback_hmu', {
          target_id: card.targetId,
          distance_from_pickup_mi: card.distanceFromPickupMi,
          via: 'swipe_or_button',
        });
      } catch { /* ignore */ }
    },
    [blastId],
  );

  const handlePass = useCallback(
    (card: FallbackDriverCardData) => {
      setPending({ type: 'pass', card, expiresAt: Date.now() + UNDO_WINDOW_MS });
      void fetch(`/api/blast/${blastId}/fallback-pass/${card.targetId}`, {
        method: 'POST',
      }).catch(() => { /* ditto */ });
      try {
        posthog.capture('blast_fallback_pass', {
          target_id: card.targetId,
          via: 'swipe',
        });
      } catch { /* ignore */ }
    },
    [blastId],
  );

  const handleUndo = useCallback(() => {
    if (!pending) return;
    const { type, card } = pending;
    // HMU is irreversible from the driver's side (they were already notified
    // via SMS/push); we still pop the card back so the rider sees what they
    // un-did. Pass IS reversible — DELETE removes the dismiss event so the
    // card resurfaces on the next poll and `dismissedIds` never picked it up.
    if (type === 'pass') {
      void fetch(`/api/blast/${blastId}/fallback-pass/${card.targetId}`, {
        method: 'DELETE',
      }).catch(() => { /* ignore */ });
    }
    try {
      posthog.capture('blast_fallback_undo', { type, target_id: card.targetId });
    } catch { /* ignore */ }
    setPending(null);
  }, [pending, blastId]);

  if (deck.length === 0 && !pending) {
    return (
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 text-center">
        <p className="text-sm text-neutral-400">No more drivers in range.</p>
        <p className="text-xs text-neutral-500 mt-1">
          Bump your blast to reach drivers a bit farther out.
        </p>
      </div>
    );
  }

  // Render top 3 cards for depth — the rest are queued offscreen.
  const visible = deck.slice(0, 3);

  return (
    <div>
      <div
        style={{
          position: 'relative',
          minHeight: 340,
          // Reserve room for the stack offset so the layout doesn't jump
          // when the bottom card peeks out.
          marginBottom: 8,
        }}
      >
        <AnimatePresence>
          {visible.map((card, index) => {
            const isTop = index === 0;
            const offsetY = index * 8;
            const scale = 1 - index * 0.04;
            return (
              <motion.div
                key={card.targetId}
                initial={prefersReduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: offsetY, scale }}
                exit={prefersReduced ? undefined : { opacity: 0, x: 240, transition: { duration: 0.18 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: visible.length - index,
                  pointerEvents: isTop ? 'auto' : 'none',
                }}
              >
                {isTop ? (
                  <SwipeableCard
                    axis="x"
                    onSwipeLeft={() => handlePass(card)}
                    onSwipeRight={() => handleHmu(card)}
                    ariaLabel={`Driver ${card.driver.displayName ?? card.driver.handle ?? 'card'}. Swipe right to HMU, left to pass.`}
                    className="h-full"
                  >
                    <DriverCardBody card={card} onHmu={() => handleHmu(card)} onPass={() => handlePass(card)} />
                  </SwipeableCard>
                ) : (
                  <DriverCardBody card={card} dimmed />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Undo toast — 3s ticker bar then auto-commit. */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? undefined : { opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="mt-3 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="text-sm text-neutral-200 min-w-0 flex-1">
              {pending.type === 'hmu'
                ? <>HMU sent to <span className="font-semibold">{pending.card.driver.displayName ?? pending.card.driver.handle ?? 'driver'}</span></>
                : <>Passed on <span className="font-semibold">{pending.card.driver.displayName ?? pending.card.driver.handle ?? 'driver'}</span></>
              }
            </div>
            <button
              type="button"
              onClick={handleUndo}
              className="text-sm font-bold text-[#00E676] hover:text-[#33FF8A] transition-colors"
            >
              Undo
            </button>
            {/* Bottom ticker — visualizes the undo window. */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={prefersReduced ? undefined : { scaleX: 0 }}
              transition={prefersReduced ? undefined : { duration: UNDO_WINDOW_MS / 1000, ease: 'linear' }}
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: 2,
                width: '100%',
                background: '#00E676',
                transformOrigin: 'left',
                borderRadius: '0 0 16px 16px',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Card body ──────────────────────────────────────────────────────────────

function DriverCardBody({
  card,
  dimmed,
  onHmu,
  onPass,
}: {
  card: FallbackDriverCardData;
  dimmed?: boolean;
  onHmu?: () => void;
  onPass?: () => void;
}) {
  const name = card.driver.displayName ?? card.driver.handle ?? 'Driver';
  const initial = name.charAt(0).toUpperCase();
  const chill = Math.round(card.driver.chillScore);

  return (
    <div
      style={{
        height: 340,
        background: dimmed
          ? 'linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)'
          : 'linear-gradient(180deg, #1f1f1f 0%, #141414 100%)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        opacity: dimmed ? 0.4 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        boxShadow: dimmed ? 'none' : '0 12px 32px rgba(0,0,0,0.45)',
      }}
    >
      {/* Header — avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2a2a2a 0%, #111 100%)',
            border: '1.5px solid rgba(0,230,118,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 800,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: '#fff',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {chill}% chill
            {card.driver.tier === 'hmu_first' && <span style={{ color: '#FFB300', marginLeft: 8 }}>★ HMU First</span>}
          </div>
        </div>
      </div>

      {/* Distance pills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {card.distanceFromPickupMi != null && (
          <DistancePill
            label={card.locationIsLive ? 'Currently' : 'From'}
            valueLabel={card.locationIsLive ? `${card.distanceFromPickupMi} mi away` : `${card.distanceFromPickupMi} mi from pickup`}
            live={card.locationIsLive}
          />
        )}
        {card.distanceFromHomeMi != null && card.homeLabel && (
          <DistancePill
            label="Home"
            valueLabel={`${card.distanceFromHomeMi} mi · ${card.homeLabel}`}
            live={false}
          />
        )}
        {card.distanceFromPickupMi == null && card.distanceFromHomeMi == null && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Location not shared yet.
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Action buttons — mirror swipe gestures for accessibility. */}
      {onHmu && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onPass}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 100,
              background: 'transparent',
              color: 'rgba(255,255,255,0.6)',
              fontSize: 14,
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
            }}
          >
            Pass
          </button>
          <button
            type="button"
            onClick={onHmu}
            style={{
              flex: 2,
              padding: '12px 0',
              borderRadius: 100,
              background: '#00E676',
              color: '#080808',
              fontSize: 15,
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              letterSpacing: 0.3,
            }}
          >
            HMU
          </button>
        </div>
      )}
    </div>
  );
}

function DistancePill({
  label,
  valueLabel,
  live,
}: {
  label: string;
  valueLabel: string;
  live: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {live && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#00E676',
            boxShadow: '0 0 8px #00E676',
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
      )}
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.2 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: '#fff', marginLeft: 'auto' }}>{valueLabel}</span>
    </div>
  );
}

export default SwipeableDriverDeck;
