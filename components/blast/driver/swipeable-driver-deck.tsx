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
  distanceFromPickupMi: number | null;
  distanceFromHomeMi: number | null;
  locationIsLive: boolean;
  homeLabel: string | null;
  driver: {
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
  };
}

interface SwipeableDriverDeckProps {
  blastId: string;
  cards: FallbackDriverCardData[];
  /** Rider's offered price — used to show price compatibility on each card. */
  blastPrice?: number;
  /** Deposit amount the rider has already put down for this blast. */
  depositAmount?: number;
  onAfterHmu?: () => void;
  onAfterPass?: () => void;
}

type PendingAction =
  | { type: 'hmu'; card: FallbackDriverCardData; expiresAt: number }
  | { type: 'pass'; card: FallbackDriverCardData; expiresAt: number };

export function SwipeableDriverDeck({
  blastId,
  cards,
  blastPrice,
  depositAmount,
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
          minHeight: 480,
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
                // Exit is a simple fade — for the top card, SwipeableCard
                // already flew it off-screen imperatively before the parent
                // state update, so this only needs to handle the rare case
                // where a card is removed by other means (API cancel, etc.).
                exit={prefersReduced ? undefined : { opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
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
                    leftLabel="Nah"
                    rightLabel="HMU"
                    ariaLabel={`Driver ${card.driver.displayName ?? card.driver.handle ?? 'card'}. Swipe right to HMU, left to pass.`}
                    className="h-full"
                  >
                    <DriverCardBody
                      card={card}
                      blastPrice={blastPrice}
                      depositAmount={depositAmount}
                      onHmu={() => handleHmu(card)}
                      onPass={() => handlePass(card)}
                    />
                  </SwipeableCard>
                ) : (
                  <DriverCardBody card={card} blastPrice={blastPrice} dimmed />
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
  blastPrice,
  depositAmount,
  dimmed,
  onHmu,
  onPass,
}: {
  card: FallbackDriverCardData;
  blastPrice?: number;
  depositAmount?: number;
  dimmed?: boolean;
  onHmu?: () => void;
  onPass?: () => void;
}) {
  const { driver } = card;
  const name = driver.displayName ?? driver.handle ?? 'Driver';
  const handle = driver.handle ? `@${driver.handle}` : null;
  const chill = Math.round(driver.chillScore);

  const isVideoUrl = (url: string | null) =>
    url ? /\.(mp4|mov|webm|m4v)(\?.*)?$/i.test(url) : false;
  const thumbIsVideo = isVideoUrl(driver.thumbnailUrl);
  const photoUrl = driver.thumbnailUrl && !thumbIsVideo ? driver.thumbnailUrl : null;
  const videoUrl = driver.videoUrl ?? (thumbIsVideo ? driver.thumbnailUrl : null);
  const hasPhoto = Boolean(photoUrl);
  const hasVideo = Boolean(videoUrl);

  const areaLabels = driver.areaSlugs
    .slice(0, 3)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '));

  // Price compatibility: green if rider's offer meets driver's minimum, amber if not set
  const priceOk = driver.minimumFare != null && blastPrice != null
    ? blastPrice >= driver.minimumFare
    : null;

  return (
    <div
      style={{
        height: 480,
        background: '#111',
        borderRadius: 24,
        border: dimmed ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: dimmed ? 0.4 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        boxShadow: dimmed ? 'none' : '0 16px 40px rgba(0,0,0,0.6)',
        position: 'relative',
      }}
    >
      {/* ── Hero: photo or video — 150px keeps it recognisable without eating the detail area ── */}
      <div style={{ position: 'relative', height: 150, flexShrink: 0, background: '#1a1a1a' }}>
        {hasVideo && (
          // Video intro — autoplay muted loop so it plays silently in the deck.
          <video
            src={videoUrl!}
            autoPlay
            muted
            loop
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top center',
              display: 'block',
            }}
          />
        )}
        {!hasVideo && hasPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl!}
            alt={name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top center',
              display: 'block',
            }}
          />
        )}
        {!hasVideo && !hasPhoto && (
          /* Fallback monogram — only when neither video nor photo is available */
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #1f1f1f 0%, #0a0a0a 100%)',
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                fontSize: 72,
                color: 'rgba(255,255,255,0.12)',
                lineHeight: 1,
                letterSpacing: 2,
              }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {/* Video badge — shown when a video is playing in the hero */}
        {hasVideo && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(6px)',
              borderRadius: 20,
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>▶ Intro</span>
          </div>
        )}
        {/* Tier badge */}
        {driver.tier === 'hmu_first' && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              background: '#FFB300',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 10,
              fontWeight: 800,
              color: '#000',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            ★ HMU First
          </div>
        )}
        {/* Bottom gradient so text over the photo stays readable */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            background: 'linear-gradient(to top, #111 0%, transparent 100%)',
          }}
        />
      </div>

      {/* ── Content area (330px) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px 0', minHeight: 0 }}>

        {/* ── Row 1: Name + LIVE badge ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 26,
            color: '#fff',
            lineHeight: 1,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {name}
          </span>
          {card.locationIsLive && (
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 1,
              color: '#00E676',
              background: 'rgba(0,230,118,0.12)',
              border: '1px solid rgba(0,230,118,0.3)',
              borderRadius: 20,
              padding: '2px 7px',
              flexShrink: 0,
            }}>
              ● LIVE
            </span>
          )}
          {driver.tier === 'hmu_first' && (
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              color: '#000',
              background: '#FFB300',
              borderRadius: 20,
              padding: '2px 7px',
              flexShrink: 0,
            }}>
              ★ 1ST
            </span>
          )}
        </div>

        {/* ── Row 2: Chill score + rides ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ color: '#00E676', fontWeight: 700 }}>{chill > 0 ? `${chill}%` : '—'}</span>
            {' '}chill score
          </span>
          {driver.completedRides > 0 && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>·</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                <span style={{ color: '#fff', fontWeight: 600 }}>{driver.completedRides}</span> rides
              </span>
            </>
          )}
          {driver.lgbtqFriendly && <span style={{ fontSize: 12 }}>🏳️‍🌈</span>}
        </div>

        {/* ── Row 3: Distance (always shows something) ── */}
        <DetailRow label="Distance">
          {card.distanceFromPickupMi != null
            ? `${card.distanceFromPickupMi} mi from pickup${card.locationIsLive ? ' (live)' : ''}`
            : card.distanceFromHomeMi != null
              ? `~${card.distanceFromHomeMi} mi · Based: ${card.homeLabel ?? 'unknown'}`
              : areaLabels.length > 0
                ? `Serves ${areaLabels.join(', ')}`
                : 'GPS offline'}
        </DetailRow>

        {/* ── Row 4: Car ── */}
        <DetailRow label="Car">
          {driver.vehicleLabel
            ? [driver.vehicleLabel, driver.vehicleColor].filter(Boolean).join(' · ')
            : 'Not listed'}
        </DetailRow>

        {/* ── Row 5: Min price + deposit (side by side) ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${priceOk === false ? 'rgba(255,179,0,0.3)' : priceOk === true ? 'rgba(0,230,118,0.25)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 10,
            padding: '7px 10px',
          }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
              Min fare
            </div>
            <div style={{
              fontSize: 18,
              fontWeight: 800,
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              color: priceOk === false ? '#FFB300' : priceOk === true ? '#00E676' : '#fff',
              lineHeight: 1,
            }}>
              {driver.minimumFare != null ? `$${driver.minimumFare}` : 'Ask'}
            </div>
            {priceOk === true && (
              <div style={{ fontSize: 9, color: '#00E676', marginTop: 2 }}>in range ✓</div>
            )}
            {priceOk === false && (
              <div style={{ fontSize: 9, color: '#FFB300', marginTop: 2 }}>above offer</div>
            )}
          </div>
          {depositAmount != null && depositAmount > 0 && (
            <div style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: '7px 10px',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>
                Deposit
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 800,
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                color: '#fff',
                lineHeight: 1,
              }}>
                ${depositAmount}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>held</div>
            </div>
          )}
        </div>

        {/* ── Row 6: Extra flags ── */}
        {(driver.acceptsLongDistance || areaLabels.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {driver.acceptsLongDistance && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '2px 7px' }}>
                Long distance ✓
              </span>
            )}
            {areaLabels.map((a) => (
              <span key={a} style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '2px 7px' }}>
                {a}
              </span>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        {onHmu && (
          <div style={{ display: 'flex', gap: 10, paddingBottom: 16, paddingTop: 10 }}>
            <button
              type="button"
              onClick={onPass}
              style={{
                flex: 1,
                padding: '13px 0',
                borderRadius: 100,
                background: 'transparent',
                color: 'rgba(255,255,255,0.55)',
                fontSize: 15,
                fontWeight: 700,
                border: '1.5px solid rgba(255,255,255,0.12)',
                cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Nah
            </button>
            <button
              type="button"
              onClick={onHmu}
              style={{
                flex: 2,
                padding: '13px 0',
                borderRadius: 100,
                background: '#00E676',
                color: '#050505',
                fontSize: 16,
                fontWeight: 900,
                border: 'none',
                cursor: 'pointer',
                letterSpacing: 0.5,
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              }}
            >
              HMU
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Label-value row for structured driver data — always renders even when value
// is a fallback string like "Not listed" so the layout never has empty gaps.
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      marginBottom: 7,
      minWidth: 0,
    }}>
      <span style={{
        fontSize: 10,
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        flexShrink: 0,
        width: 56,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.85)',
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {children}
      </span>
    </div>
  );
}

export default SwipeableDriverDeck;
