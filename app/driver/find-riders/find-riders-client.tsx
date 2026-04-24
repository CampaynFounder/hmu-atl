'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAbly } from '@/hooks/use-ably';
import CelebrationConfetti from '@/components/shared/celebration-confetti';

interface MaskedRider {
  id: string;
  handle: string;
  firstName: string;
  lastName: string;
  homeAreas: string[];
  avatarUrl: string | null;
  gender: string | null;
  driverPreference: string | null;
  lgbtqFriendly: boolean;
  completedRides: number;
}

interface Props {
  initialRiders: MaskedRider[];
  initialBatchSize: number;
  sentToday: number;
  dailyLimit: number | null;
  driverId: string;
  activeRideBanner?: React.ReactNode;
}

type ViewMode = 'feed' | 'grid';
const VIEW_STORAGE_KEY = 'hmu_find_riders_view';
const PAGE_SIZE = 12;

// Human labels for rider driver_preference values. The column mixes old
// (male/female/any) and new (women_only/men_only/no_preference/prefer_*)
// shapes, so this map tolerates both.
const PREF_LABEL: Record<string, string> = {
  no_preference: 'Any driver',
  any: 'Any driver',
  women_only: 'Women only',
  men_only: 'Men only',
  female: 'Women only',
  male: 'Men only',
  prefer_women: 'Prefers women',
  prefer_men: 'Prefers men',
};

function initialsFor(rider: MaskedRider): string {
  const f = rider.firstName?.trim() || '';
  const l = rider.lastName?.trim() || '';
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f.length >= 2) return f.slice(0, 2).toUpperCase();
  if (f) return (f[0] + f[0]).toUpperCase();
  return '??';
}

function displayNameFor(rider: MaskedRider): string {
  if (rider.handle) return `@${rider.handle}`;
  const f = rider.firstName?.trim() || '';
  const l = rider.lastName?.trim() || '';
  if (f && l) return `${f} ${l[0]}.`;
  if (f) return f;
  return initialsFor(rider);
}

function genderLabel(gender: string | null): string | null {
  if (!gender) return null;
  const g = gender.toLowerCase();
  if (g === 'woman' || g === 'female') return 'Woman';
  if (g === 'man' || g === 'male') return 'Man';
  if (g === 'nonbinary' || g === 'nb') return 'Non-binary';
  return gender;
}

export default function FindRidersClient({
  initialRiders,
  initialBatchSize,
  sentToday: initialSent,
  dailyLimit,
  driverId,
  activeRideBanner,
}: Props) {
  const [list, setList] = useState(initialRiders);
  const [sentToday, setSentToday] = useState(initialSent);
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [celebrateRiderId, setCelebrateRiderId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('feed');
  const [hasMore, setHasMore] = useState(initialRiders.length === initialBatchSize);
  const [fetchingMore, setFetchingMore] = useState(false);
  // Whether the initial hydration has applied the persisted view setting.
  // Stays 'feed' during SSR → no flash for the default case; flips to the
  // stored value (if any) after mount.
  const [hydrated, setHydrated] = useState(false);
  // When pagination exhausts (hasMore=false), we keep re-fetching from
  // offset=0 so the feed loops. If the API ever returns an empty loop,
  // we stop — nothing to recycle.
  const [canLoop, setCanLoop] = useState(true);

  const offsetRef = useRef(initialRiders.length);
  const lastFetchRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'feed' || saved === 'grid') setView(saved);
    } catch { /* Storage disabled — fall back to default */ }
    setHydrated(true);
  }, []);

  const updateView = useCallback((next: ViewMode) => {
    setView(next);
    try { sessionStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* silent */ }
  }, []);

  const atCap = dailyLimit !== null && sentToday >= dailyLimit;

  useAbly({
    channelName: `user:${driverId}:notify`,
    onMessage: (msg) => {
      if (msg.name !== 'hmu_linked') return;
      const data = msg.data as { riderId?: string };
      if (!data?.riderId) return;
      setCelebrateRiderId(data.riderId);
      setToast('A rider linked with you!');
      window.setTimeout(() => setCelebrateRiderId(null), 3000);
      window.setTimeout(() => setToast(null), 4000);
    },
  });

  const fetchMore = useCallback(async () => {
    if (fetchingMore) return;
    // Throttle so a single near-end position doesn't storm the API.
    if (Date.now() - lastFetchRef.current < 400) return;
    // Normal pagination as long as the API reports more pages.
    // Once exhausted, loop from offset=0 to give the feed an infinite feel.
    const looping = !hasMore;
    if (looping && (!canLoop || list.length === 0)) return;

    setFetchingMore(true);
    lastFetchRef.current = Date.now();
    try {
      const offset = looping ? 0 : offsetRef.current;
      const res = await fetch(`/api/driver/find-riders/list?offset=${offset}&limit=${PAGE_SIZE}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const next: MaskedRider[] = data.riders || [];

      if (looping) {
        if (next.length === 0) {
          setCanLoop(false);
        } else {
          // Append the loop payload verbatim — duplicate riders are fine,
          // React keys are computed from (index, id) so React doesn't complain.
          setList((prev) => prev.concat(next));
        }
      } else {
        setList((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const fresh = next.filter((r) => !seen.has(r.id));
          offsetRef.current += next.length;
          return prev.concat(fresh);
        });
        setHasMore(!!data.hasMore);
      }
    } catch {
      // Silent — the sentinel retries on next scroll intersection.
    } finally {
      setFetchingMore(false);
    }
  }, [fetchingMore, hasMore, canLoop, list.length]);

  // IntersectionObserver-based infinite scroll. Fires both for normal
  // pagination (hasMore) and for end-of-list loop re-fetch (!hasMore but
  // canLoop). In feed mode the scroller itself is the root; in grid mode
  // the document is. Both are handled by passing `root: null` + the same
  // ancestor-chain walk the browser does.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (!hasMore && !canLoop) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) fetchMore(); },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchMore, hasMore, canLoop, view, list.length]);

  const handleHmu = useCallback(async (riderId: string) => {
    if (sending) return;
    if (atCap) {
      setToast('Daily cap reached — come back tomorrow.');
      window.setTimeout(() => setToast(null), 3000);
      return;
    }
    setSending(riderId);
    try {
      const res = await fetch('/api/driver/hmu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId }),
      });
      if (res.ok) {
        setList((prev) => prev.filter((r) => r.id !== riderId));
        setSentToday((n) => n + 1);
        setToast('HMU sent');
      } else if (res.status === 429) {
        setToast('Daily cap reached — come back tomorrow.');
      } else if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        setToast(body.error === 'blocked' ? 'You can’t HMU this rider.' : 'Not allowed.');
      } else if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setToast(body.error === 'not_present' ? 'Go live first to send HMUs.' : 'Not allowed.');
      } else {
        setToast('Something went wrong.');
      }
    } catch {
      setToast('Network error.');
    } finally {
      setSending(null);
      window.setTimeout(() => setToast(null), 2800);
    }
  }, [sending, atCap]);

  const capDisplay = useMemo(() => {
    if (dailyLimit === null) return `${sentToday} sent today`;
    return `${sentToday}/${dailyLimit} today`;
  }, [sentToday, dailyLimit]);

  const isFeed = view === 'feed';
  const frameStyle: React.CSSProperties = isFeed
    // Feed mode: fixed-viewport frame. Document doesn't scroll. The scroller
    // child owns all scrolling, so cards can be sized off that container and
    // the HMU button is guaranteed visible at the bottom of every card.
    ? { height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
    // Grid mode: normal document flow.
    : { minHeight: '100svh' };

  return (
    <div
      style={{
        background: '#080808',
        color: '#fff',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        ...frameStyle,
      }}
    >
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes glow { 0% { box-shadow: 0 0 0 rgba(0,230,118,0); } 50% { box-shadow: 0 0 24px rgba(0,230,118,0.55); } 100% { box-shadow: 0 0 0 rgba(0,230,118,0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes cardIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

        .fr-card-in { animation: cardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }

        /* Feed view — the flex:1 child owns scrolling; each card is 100% of its height */
        .fr-feed-scroller {
          flex: 1; min-height: 0;
          overflow-y: scroll;
          scroll-snap-type: y mandatory;
          scroll-behavior: smooth;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .fr-feed-scroller::-webkit-scrollbar { display: none; }
        .fr-feed-card {
          height: 100%;
          scroll-snap-align: start;
          scroll-snap-stop: always;
          position: relative;
          overflow: hidden;
        }
        .fr-feed-bg {
          position: absolute; inset: 0;
          background-size: cover; background-position: center;
          filter: blur(30px); transform: scale(1.15);
        }
        .fr-feed-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(8,8,8,0.55) 0%, rgba(8,8,8,0.15) 40%, rgba(8,8,8,0.85) 100%);
        }
        .fr-skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 100%);
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }
      `}</style>

      <CelebrationConfetti active={celebrateRiderId !== null} variant="cannon" />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, left: 20, right: 20, zIndex: 100,
          background: '#141414', border: '1px solid rgba(0,230,118,0.3)',
          borderRadius: 14, padding: '12px 16px',
          fontSize: 14, color: '#fff', textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}>
          {toast}
        </div>
      )}

      {/* Header — static block in feed mode (frame is fixed-viewport), sticky in grid. */}
      <div
        style={{
          ...(isFeed
            ? { flexShrink: 0, zIndex: 30, background: '#080808' }
            : { position: 'sticky', top: 0, zIndex: 30, background: '#080808' }),
          padding: '56px 20px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h1 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 28, margin: 0,
          }}>Find Riders</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ViewToggle view={view} onChange={updateView} hydrated={hydrated} />
            <Link href="/driver/home" style={{ fontSize: 14, color: '#00E676', fontWeight: 600, textDecoration: 'none' }}>
              Back
            </Link>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: atCap ? '#FF5252' : '#bbb',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 4,
            background: atCap ? '#FF5252' : '#00E676', display: 'inline-block',
          }} />
          <span>{capDisplay}</span>
          {atCap && <span style={{ marginLeft: 'auto', color: '#FF5252' }}>Cap reached</span>}
        </div>
      </div>

      {/* Banner + empty state shown only when relevant */}
      {list.length === 0 && !fetchingMore ? (
        <div style={{ padding: '20px' }}>
          {activeRideBanner}
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>{'👋'}</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No riders here yet</div>
            <div style={{ fontSize: 14, color: '#888' }}>Check back soon.</div>
          </div>
        </div>
      ) : isFeed ? (
        <div className="fr-feed-scroller">
          {list.map((rider, i) => (
            <FeedCard
              // Key includes index so looped duplicates get distinct React identities.
              key={`${i}-${rider.id}`}
              rider={rider}
              sending={sending === rider.id}
              disabled={atCap}
              celebrating={celebrateRiderId === rider.id}
              onHmu={() => handleHmu(rider.id)}
              // Stagger the first few entry animations so the TikTok stack
              // reveals itself instead of popping in all at once.
              animationDelayMs={i < 4 ? i * 60 : 0}
              activeRideBanner={i === 0 ? activeRideBanner : undefined}
            />
          ))}
          {fetchingMore && <FeedSkeleton />}
          {/* Sentinel sits inline with cards so IntersectionObserver fires when it
              comes within rootMargin of the scroller's bottom. Height=0 keeps it
              from consuming a snap slot. */}
          <div ref={sentinelRef} style={{ height: 1, scrollSnapAlign: 'none' }} />
        </div>
      ) : (
        <div style={{ padding: '0 20px 40px' }}>
          {activeRideBanner}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {list.map((rider, i) => (
              <GridCard
                key={`${i}-${rider.id}`}
                rider={rider}
                sending={sending === rider.id}
                disabled={atCap}
                celebrating={celebrateRiderId === rider.id}
                onHmu={() => handleHmu(rider.id)}
                animationDelayMs={i < 8 ? i * 40 : 0}
              />
            ))}
            {fetchingMore && Array.from({ length: 4 }).map((_, i) => <GridSkeleton key={`sk-${i}`} />)}
          </div>
          <div ref={sentinelRef} style={{ height: 1, marginTop: 24 }} />
        </div>
      )}
    </div>
  );
}

// ─── View toggle ───

function ViewToggle({ view, onChange, hydrated }: { view: ViewMode; onChange: (v: ViewMode) => void; hydrated: boolean }) {
  const btn = (mode: ViewMode, label: string, icon: string) => (
    <button
      onClick={() => onChange(mode)}
      aria-label={`${label} view`}
      aria-pressed={view === mode}
      style={{
        padding: '6px 10px',
        borderRadius: 100,
        border: 'none',
        background: view === mode ? 'rgba(0,230,118,0.15)' : 'transparent',
        color: view === mode ? '#00E676' : '#888',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
        opacity: hydrated ? 1 : 0.0,
        transition: 'opacity 0.15s, background 0.15s, color 0.15s',
        fontFamily: 'inherit',
      }}
    >
      {icon}
    </button>
  );
  return (
    <div style={{
      display: 'flex', gap: 2,
      background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 100, padding: 2,
    }}>
      {btn('feed', 'Feed', '▤')}
      {btn('grid', 'Grid', '▦')}
    </div>
  );
}

// ─── Feed (TikTok) card ───

function FeedCard({
  rider, sending, disabled, celebrating, onHmu, animationDelayMs, activeRideBanner,
}: {
  rider: MaskedRider;
  sending: boolean;
  disabled: boolean;
  celebrating: boolean;
  onHmu: () => void;
  animationDelayMs: number;
  activeRideBanner?: React.ReactNode;
}) {
  const prefLabel = rider.driverPreference ? PREF_LABEL[rider.driverPreference] ?? null : null;
  const gender = genderLabel(rider.gender);

  return (
    <div className="fr-feed-card">
      {/* Blurred avatar backdrop */}
      {rider.avatarUrl ? (
        <div className="fr-feed-bg" style={{ backgroundImage: `url("${rider.avatarUrl}")` }} />
      ) : (
        <div className="fr-feed-bg" style={{ background: 'radial-gradient(circle at 50% 40%, #1a1a1a, #080808)' }} />
      )}
      <div className="fr-feed-overlay" />

      {activeRideBanner && (
        <div style={{
          position: 'absolute', top: 16, left: 16, right: 16, zIndex: 5,
        }}>{activeRideBanner}</div>
      )}

      {/* Big initials medallion — anchored center-upper */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div
          className="fr-card-in"
          style={{
            animationDelay: `${animationDelayMs}ms`,
            width: 140, height: 140, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.08)',
            background: 'rgba(20,20,20,0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 48, color: '#fff', letterSpacing: 2,
            boxShadow: celebrating ? '0 0 48px rgba(0,230,118,0.55)' : '0 4px 20px rgba(0,0,0,0.4)',
            transform: 'translateY(-40px)',
          }}
        >
          {initialsFor(rider)}
        </div>
      </div>

      {/* Bottom info / CTA card */}
      <div
        className="fr-card-in"
        style={{
          position: 'absolute', left: 16, right: 16, bottom: 28,
          animationDelay: `${animationDelayMs + 60}ms`,
        }}
      >
        <div style={{
          background: 'rgba(20,20,20,0.78)',
          backdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 22, padding: '18px 18px 16px',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            {displayNameFor(rider)}
          </div>
          <div style={{ fontSize: 12, color: '#bbb', marginBottom: 10 }}>
            {rider.homeAreas.length ? rider.homeAreas.join(' · ') : 'Area not set'}
          </div>

          <StatRow rider={rider} />

          {(prefLabel || gender || rider.lgbtqFriendly) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {gender && <Chip label={gender} />}
              {prefLabel && <Chip label={prefLabel} tone="neutral" />}
              {rider.lgbtqFriendly && <Chip label="🏳️‍🌈 LGBTQ+ friendly" tone="lgbtq" />}
            </div>
          )}

          <button
            onClick={onHmu}
            disabled={sending || disabled}
            style={{
              marginTop: 14, width: '100%',
              padding: '14px', borderRadius: 100, border: 'none',
              background: disabled ? '#333' : '#00E676',
              color: disabled ? '#888' : '#080808',
              fontWeight: 800, fontSize: 16,
              cursor: (sending || disabled) ? 'not-allowed' : 'pointer',
              opacity: sending ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            {sending ? 'Sending…' : 'HMU'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="fr-feed-card">
      <div className="fr-feed-bg fr-skeleton" />
      <div className="fr-feed-overlay" />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="fr-skeleton" style={{
          width: 140, height: 140, borderRadius: '50%',
          transform: 'translateY(-40px)',
        }} />
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}>
        <div className="fr-skeleton" style={{ height: 120, borderRadius: 22 }} />
      </div>
    </div>
  );
}

// ─── Grid card (compact zoom-out) ───

function GridCard({
  rider, sending, disabled, celebrating, onHmu, animationDelayMs,
}: {
  rider: MaskedRider;
  sending: boolean;
  disabled: boolean;
  celebrating: boolean;
  onHmu: () => void;
  animationDelayMs: number;
}) {
  const prefLabel = rider.driverPreference ? PREF_LABEL[rider.driverPreference] ?? null : null;
  const gender = genderLabel(rider.gender);

  return (
    <div
      className="fr-card-in"
      style={{
        animationDelay: `${animationDelayMs}ms`,
        background: '#141414',
        border: celebrating ? '1px solid rgba(0,230,118,0.55)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        overflow: 'hidden',
        transition: 'all 0.2s',
        animation: celebrating ? 'glow 2s ease-in-out' : undefined,
      }}
    >
      <div style={{
        width: '100%', aspectRatio: '4 / 3', overflow: 'hidden',
        position: 'relative', background: '#0A0A0A',
      }}>
        {rider.avatarUrl ? (
          <img
            src={rider.avatarUrl} alt="" aria-hidden="true"
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              filter: 'blur(18px)', transform: 'scale(1.15)',
            }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'radial-gradient(circle at 50% 40%, #1a1a1a, #0a0a0a)',
          }} />
        )}
        {/* Initials medallion overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.12)',
            background: 'rgba(20,20,20,0.55)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 22, color: '#fff', letterSpacing: 1,
          }}>
            {initialsFor(rider)}
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: '#fff',
          marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayNameFor(rider)}
        </div>
        <div style={{
          fontSize: 11, color: '#888',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {rider.homeAreas.length ? rider.homeAreas.join(', ') : 'Area not set'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', margin: '8px 0' }}>
          <span>{rider.completedRides} ride{rider.completedRides === 1 ? '' : 's'}</span>
          {gender && <span style={{ color: '#666' }}>·</span>}
          {gender && <span>{gender}</span>}
        </div>

        {(prefLabel || rider.lgbtqFriendly) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {prefLabel && <Chip label={prefLabel} tone="neutral" compact />}
            {rider.lgbtqFriendly && <Chip label="🏳️‍🌈" tone="lgbtq" compact />}
          </div>
        )}

        <button
          onClick={onHmu}
          disabled={sending || disabled}
          style={{
            width: '100%', padding: '10px',
            borderRadius: 100, border: 'none',
            background: disabled ? '#333' : '#00E676',
            color: disabled ? '#888' : '#080808',
            fontWeight: 700, fontSize: 13,
            cursor: (sending || disabled) ? 'not-allowed' : 'pointer',
            opacity: sending ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          {sending ? 'Sending…' : 'HMU'}
        </button>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div style={{
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      overflow: 'hidden',
    }}>
      <div className="fr-skeleton" style={{ width: '100%', aspectRatio: '4 / 3' }} />
      <div style={{ padding: '12px 14px 14px' }}>
        <div className="fr-skeleton" style={{ height: 14, borderRadius: 4, marginBottom: 6, width: '60%' }} />
        <div className="fr-skeleton" style={{ height: 10, borderRadius: 4, marginBottom: 10, width: '40%' }} />
        <div className="fr-skeleton" style={{ height: 32, borderRadius: 100 }} />
      </div>
    </div>
  );
}

// ─── Shared pieces ───

function StatRow({ rider }: { rider: MaskedRider }) {
  const rides = rider.completedRides;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 4 }}>
      <div>
        <div style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 24, color: '#00E676', lineHeight: 1,
        }}>
          {rides}
        </div>
        <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, textTransform: 'uppercase' }}>
          {rides === 1 ? 'Ride' : 'Rides'}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, tone, compact }: { label: string; tone?: 'neutral' | 'lgbtq'; compact?: boolean }) {
  const palette = {
    neutral: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', color: '#bbb' },
    lgbtq: { bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.3)', color: '#D9B5FF' },
  }[tone || 'neutral'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: palette.bg, border: `1px solid ${palette.border}`, color: palette.color,
      borderRadius: 100,
      padding: compact ? '2px 8px' : '4px 10px',
      fontSize: compact ? 10 : 11, fontWeight: 600,
      letterSpacing: 0.3,
    }}>
      {label}
    </span>
  );
}
