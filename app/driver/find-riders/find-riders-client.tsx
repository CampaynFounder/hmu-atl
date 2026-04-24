'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAbly } from '@/hooks/use-ably';
import CelebrationConfetti from '@/components/shared/celebration-confetti';
import HmuBrowseStyles from '@/components/hmu/browse/styles';
import ViewToggle, { useViewMode } from '@/components/hmu/browse/view-toggle';
import Chip from '@/components/hmu/browse/chip';
import { FeedSkeleton, GridSkeleton } from '@/components/hmu/browse/skeletons';
import { useInfiniteList } from '@/components/hmu/browse/use-infinite-list';

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
  const [sentToday, setSentToday] = useState(initialSent);
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [celebrateRiderId, setCelebrateRiderId] = useState<string | null>(null);

  const { view, setView, hydrated } = useViewMode(VIEW_STORAGE_KEY);

  const {
    items: list,
    setItems: setList,
    fetchingMore,
    sentinelRef,
  } = useInfiniteList<MaskedRider>({
    initialItems: initialRiders,
    initialBatchSize,
    pageSize: PAGE_SIZE,
    allowLoop: true,
    getId: (r) => r.id,
    fetchPage: useCallback(async (offset, limit) => {
      const res = await fetch(`/api/driver/find-riders/list?offset=${offset}&limit=${limit}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      return { items: (data.riders as MaskedRider[]) ?? [], hasMore: !!data.hasMore };
    }, []),
  });

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
      } else {
        setToast('Something went wrong.');
      }
    } catch {
      setToast('Network error.');
    } finally {
      setSending(null);
      window.setTimeout(() => setToast(null), 2800);
    }
  }, [sending, atCap, setList]);

  const capDisplay = useMemo(() => {
    if (dailyLimit === null) return `${sentToday} sent today`;
    return `${sentToday}/${dailyLimit} today`;
  }, [sentToday, dailyLimit]);

  const isFeed = view === 'feed';
  const frameStyle: React.CSSProperties = isFeed
    ? { height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
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
      <HmuBrowseStyles />
      <CelebrationConfetti active={celebrateRiderId !== null} variant="cannon" />

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
            <ViewToggle view={view} onChange={setView} hydrated={hydrated} />
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
        <div className="hmu-feed-scroller">
          {list.map((rider, i) => (
            <FeedCard
              key={`${i}-${rider.id}`}
              rider={rider}
              sending={sending === rider.id}
              disabled={atCap}
              celebrating={celebrateRiderId === rider.id}
              onHmu={() => handleHmu(rider.id)}
              animationDelayMs={i < 4 ? i * 60 : 0}
              activeRideBanner={i === 0 ? activeRideBanner : undefined}
            />
          ))}
          {fetchingMore && <FeedSkeleton />}
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
    <div className="hmu-feed-card">
      {rider.avatarUrl ? (
        <div className="hmu-feed-bg" style={{ backgroundImage: `url("${rider.avatarUrl}")` }} />
      ) : (
        <div className="hmu-feed-bg" style={{ background: 'radial-gradient(circle at 50% 40%, #1a1a1a, #080808)' }} />
      )}
      <div className="hmu-feed-overlay" />

      {activeRideBanner && (
        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 5 }}>
          {activeRideBanner}
        </div>
      )}

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div
          className="hmu-card-in"
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

      <div
        className="hmu-card-in"
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
      className="hmu-card-in"
      style={{
        animationDelay: `${animationDelayMs}ms`,
        background: '#141414',
        border: celebrating ? '1px solid rgba(0,230,118,0.55)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        overflow: 'hidden',
        transition: 'all 0.2s',
        animation: celebrating ? 'hmuBrowseGlow 2s ease-in-out' : undefined,
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
