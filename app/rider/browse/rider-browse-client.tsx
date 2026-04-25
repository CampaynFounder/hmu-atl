'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { posthog } from '@/components/analytics/posthog-provider';
import DriverProfileOverlay from '@/components/driver/driver-profile-overlay';
import HmuBrowseStyles from '@/components/hmu/browse/styles';
import ViewToggle, { useViewMode } from '@/components/hmu/browse/view-toggle';
import Chip from '@/components/hmu/browse/chip';
import { FeedSkeleton, GridSkeleton } from '@/components/hmu/browse/skeletons';
import { useInfiniteList } from '@/components/hmu/browse/use-infinite-list';
import type { BrowseDriverRow } from '@/lib/hmu/browse-drivers-query';
import BookingDrawer from './booking-drawer';

const VIEW_STORAGE_KEY = 'hmu_rider_browse_view';
const PAGE_SIZE = 12;

interface Props {
  initialDrivers: BrowseDriverRow[];
  initialBatchSize: number;
}

export default function RiderBrowseClient({ initialDrivers, initialBatchSize }: Props) {
  const [filterFwu, setFilterFwu] = useState(false);
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [bookingHandle, setBookingHandle] = useState<string | null>(null);
  const [profileHandle, setProfileHandle] = useState<string | null>(null);

  const { view, setView, hydrated } = useViewMode(VIEW_STORAGE_KEY);

  const fetchPage = useCallback(async (offset: number, limit: number) => {
    const res = await fetch(`/api/rider/browse/list?offset=${offset}&limit=${limit}`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    return { items: (data.drivers as BrowseDriverRow[]) ?? [], hasMore: !!data.hasMore };
  }, []);

  const {
    items: list,
    fetchingMore,
    sentinelRef,
  } = useInfiniteList<BrowseDriverRow>({
    initialItems: initialDrivers,
    initialBatchSize,
    pageSize: PAGE_SIZE,
    allowLoop: true,
    getId: (d) => d.handle,
    fetchPage,
  });

  const allAreas = useMemo(
    () => Array.from(new Set(list.flatMap((d) => d.areas))).sort(),
    [list],
  );

  const filtered = useMemo(() => list.filter((d) => {
    if (filterFwu && !d.fwu) return false;
    if (filterMaxPrice && d.minPrice > Number(filterMaxPrice)) return false;
    if (filterArea && !d.areas.some((a) => a.toLowerCase().includes(filterArea.toLowerCase()))) return false;
    return true;
  }), [list, filterFwu, filterMaxPrice, filterArea]);

  const bookingDriver = bookingHandle ? list.find((d) => d.handle === bookingHandle) ?? null : null;

  const isFeed = view === 'feed';
  const frameStyle: React.CSSProperties = isFeed
    ? { height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
    : { minHeight: '100svh' };

  const openBooking = (handle: string) => {
    posthog.capture('browse_hmu_clicked', { driverHandle: handle });
    setBookingHandle(handle);
  };

  const filtersActive = filterFwu || filterArea || filterMaxPrice;
  const clearFilters = () => { setFilterFwu(false); setFilterArea(''); setFilterMaxPrice(''); };

  return (
    <>
      <div style={{
        background: '#080808', color: '#fff',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        ...frameStyle,
      }}>
        <HmuBrowseStyles />

        <div style={{
          ...(isFeed
            ? { flexShrink: 0, zIndex: 30, background: '#080808' }
            : { position: 'sticky', top: 0, zIndex: 30, background: '#080808' }),
          padding: '56px 20px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h1 style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 28, margin: 0,
            }}>Browse Drivers</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ViewToggle view={view} onChange={setView} hydrated={hydrated} />
              <Link href="/rider/home" style={{ fontSize: 14, color: '#00E676', fontWeight: 600, textDecoration: 'none' }}>
                Back
              </Link>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            <button onClick={() => setFilterFwu(!filterFwu)} style={pillStyle(filterFwu)}>
              FWU
            </button>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              style={{ ...pillStyle(!!filterArea), appearance: 'none' }}
            >
              <option value="">All Areas</option>
              {allAreas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input
              type="number"
              placeholder="Max $"
              value={filterMaxPrice}
              onChange={(e) => setFilterMaxPrice(e.target.value)}
              style={{ ...pillStyle(!!filterMaxPrice), width: 80, outline: 'none' }}
            />
            {filtersActive && (
              <button
                onClick={clearFilters}
                style={{
                  padding: '8px 12px', borderRadius: 100, border: 'none', fontSize: 11,
                  background: 'rgba(255,82,82,0.1)', color: '#FF5252', cursor: 'pointer',
                  fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  fontFamily: 'inherit',
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 && !fetchingMore ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>
              {list.length ? '🔍' : '🚗'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              {list.length ? 'No drivers match your filters' : 'No drivers available right now'}
            </div>
            <div style={{ fontSize: 14, color: '#888', lineHeight: 1.5, marginBottom: 16 }}>
              {list.length
                ? 'Tweak the filters or clear them.'
                : 'Check back soon — drivers go live throughout the day.'}
            </div>
            {list.length > 0 && filtersActive && (
              <button
                onClick={clearFilters}
                style={{
                  padding: '10px 20px', borderRadius: 100,
                  border: '1px solid rgba(0,230,118,0.2)', background: 'transparent',
                  color: '#00E676', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : isFeed ? (
          <div className="hmu-feed-scroller">
            {filtered.map((d, i) => (
              <FeedDriverCard
                key={`${i}-${d.handle}`}
                driver={d}
                onBook={() => openBooking(d.handle)}
                onProfile={() => setProfileHandle(d.handle)}
                animationDelayMs={i < 4 ? i * 60 : 0}
              />
            ))}
            {fetchingMore && <FeedSkeleton />}
            <div ref={sentinelRef} style={{ height: 1, scrollSnapAlign: 'none' }} />
          </div>
        ) : (
          <div style={{ padding: '0 20px 40px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
            }}>
              {filtered.map((d, i) => (
                <GridDriverCard
                  key={`${i}-${d.handle}`}
                  driver={d}
                  onBook={() => openBooking(d.handle)}
                  onProfile={() => setProfileHandle(d.handle)}
                  animationDelayMs={i < 8 ? i * 40 : 0}
                />
              ))}
              {fetchingMore && Array.from({ length: 4 }).map((_, i) => <GridSkeleton key={`sk-${i}`} />)}
            </div>
            <div ref={sentinelRef} style={{ height: 1, marginTop: 24 }} />
          </div>
        )}
      </div>

      {bookingDriver && (
        <BookingDrawer driver={bookingDriver} onClose={() => setBookingHandle(null)} />
      )}
      {profileHandle && (
        <DriverProfileOverlay
          handle={profileHandle}
          open={true}
          onClose={() => setProfileHandle(null)}
        />
      )}
    </>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 100, border: 'none',
    fontSize: 12, fontWeight: 700,
    background: active ? 'rgba(0,230,118,0.15)' : '#1a1a1a',
    color: active ? '#00E676' : '#888',
    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
  };
}

function DriverChips({ driver, compact }: { driver: BrowseDriverRow; compact?: boolean }) {
  return (
    <>
      {driver.verificationStatus === 'pending' && (
        <Chip label={compact ? 'NEW' : 'NEW · Verifying'} tone="warning" compact={compact} />
      )}
      {driver.isHmuFirst && <Chip label={`${'🥇'} HMU 1ST`} tone="first" compact={compact} />}
      {driver.fwu && <Chip label="FWU" tone="fwu" compact={compact} />}
      {driver.acceptsCash && (
        <Chip
          label={driver.cashOnly ? 'CASH ONLY' : 'CASH OK'}
          tone="cash"
          compact={compact}
        />
      )}
      {driver.lgbtqFriendly && <Chip label={compact ? '🏳️‍🌈' : 'LGBTQ+'} tone="lgbtq" compact={compact} />}
    </>
  );
}

// ─── Feed (TikTok) card ──────────────────────────────────────────────────────

function FeedDriverCard({
  driver, onBook, onProfile, animationDelayMs,
}: {
  driver: BrowseDriverRow;
  onBook: () => void;
  onProfile: () => void;
  animationDelayMs: number;
}) {
  const heroSrc = driver.photoUrl || driver.videoUrl;

  return (
    <div className="hmu-feed-card">
      {heroSrc ? (
        <div className="hmu-feed-bg" style={{ backgroundImage: `url("${driver.photoUrl ?? ''}")` }} />
      ) : (
        <div className="hmu-feed-bg" style={{ background: 'radial-gradient(circle at 50% 40%, #1a1a1a, #080808)' }} />
      )}
      <div className="hmu-feed-overlay" />

      {/* Centerpiece: video → photo → fallback gradient. Sits center-upper so the
          info card at the bottom doesn't overlap. */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div
          className="hmu-card-in"
          style={{
            animationDelay: `${animationDelayMs}ms`,
            width: 220, height: 220, borderRadius: 28,
            border: '2px solid rgba(255,255,255,0.10)',
            background: '#0A0A0A', overflow: 'hidden',
            boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
            transform: 'translateY(-30px)',
          }}
        >
          {driver.videoUrl ? (
            <video
              src={driver.videoUrl}
              autoPlay muted loop playsInline preload="metadata"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : driver.photoUrl ? (
            <img
              src={driver.photoUrl}
              alt={driver.displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 64, color: '#444',
              background: 'linear-gradient(135deg, #1a1a1a, #0a0a0a)',
            }}>
              {driver.displayName.charAt(0).toUpperCase()}
            </div>
          )}
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
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            gap: 12, marginBottom: 4,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 22, fontWeight: 800, color: '#fff',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {driver.displayName}
              </div>
              <button
                onClick={onProfile}
                style={{
                  fontSize: 12, color: '#888', background: 'none', border: 'none',
                  padding: 0, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontFamily: 'inherit',
                }}
              >
                @{driver.handle} <span style={{ fontSize: 10, color: '#00E676' }}>view</span>
              </button>
            </div>
            {driver.minPrice > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                  fontSize: 24, color: '#fff', lineHeight: 1,
                }}>
                  ${driver.minPrice}+
                </div>
                <div style={{ fontSize: 9, color: '#888', letterSpacing: 0.5 }}>
                  starts at
                </div>
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, color: '#bbb', marginBottom: 10 }}>
            {driver.areas.length ? driver.areas.slice(0, 4).join(' · ') : 'Area not set'}
          </div>

          {driver.liveMessage && (
            <div style={{
              background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.15)',
              borderRadius: 12, padding: '8px 12px', marginBottom: 10,
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}>
              <Chip label={
                <>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#00E676', display: 'inline-block',
                    animation: 'hmuBrowsePulse 1.5s ease-in-out infinite',
                  }} />
                  LIVE
                </>
              } tone="live" compact />
              <span style={{ fontSize: 13, color: '#fff', lineHeight: 1.3 }}>
                {driver.liveMessage}
              </span>
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, color: '#bbb', marginBottom: 10,
          }}>
            <span>
              <span style={{
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                color: '#00E676', fontSize: 18, marginRight: 4,
              }}>
                {driver.chillScore.toFixed(0)}%
              </span>
              chill
            </span>
            {driver.vehicleSummary && (
              <>
                <span style={{ color: '#444' }}>·</span>
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                }}>
                  🚗 {driver.vehicleSummary.label}
                </span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <DriverChips driver={driver} />
          </div>

          <button
            onClick={onBook}
            style={{
              width: '100%', padding: 14, borderRadius: 100, border: 'none',
              background: '#00E676', color: '#080808',
              fontWeight: 800, fontSize: 16, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            HMU
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Grid card (compact zoom-out) ────────────────────────────────────────────

function GridDriverCard({
  driver, onBook, onProfile, animationDelayMs,
}: {
  driver: BrowseDriverRow;
  onBook: () => void;
  onProfile: () => void;
  animationDelayMs: number;
}) {
  return (
    <div
      className="hmu-card-in"
      style={{
        animationDelay: `${animationDelayMs}ms`,
        background: '#141414',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        overflow: 'hidden',
        transition: 'all 0.2s',
      }}
    >
      <div
        onClick={onProfile}
        style={{
          width: '100%', aspectRatio: '4 / 3', overflow: 'hidden',
          position: 'relative', background: '#0A0A0A', cursor: 'pointer',
        }}
      >
        {driver.videoUrl ? (
          <video
            src={driver.videoUrl}
            muted playsInline loop autoPlay preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : driver.photoUrl ? (
          <img
            src={driver.photoUrl}
            alt={driver.displayName}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 36, color: '#444',
            background: 'radial-gradient(circle at 50% 40%, #1a1a1a, #0a0a0a)',
          }}>
            {driver.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {driver.liveMessage && (
          <span style={{
            position: 'absolute', top: 8, left: 8,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(0,230,118,0.18)', border: '1px solid rgba(0,230,118,0.35)',
            color: '#00E676', borderRadius: 100, padding: '2px 8px',
            fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: '#00E676', animation: 'hmuBrowsePulse 1.5s ease-in-out infinite',
            }} />
            LIVE
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {driver.displayName}
        </div>
        <div style={{
          fontSize: 11, color: '#888', marginBottom: 8,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {driver.areas.length ? driver.areas.join(', ') : 'Area not set'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginBottom: 8 }}>
          <span style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            color: '#00E676', fontSize: 16,
          }}>
            {driver.chillScore.toFixed(0)}%
          </span>
          {driver.minPrice > 0 && (
            <>
              <span style={{ color: '#444' }}>·</span>
              <span>${driver.minPrice}+</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, minHeight: 18 }}>
          <DriverChips driver={driver} compact />
        </div>

        <button
          onClick={onBook}
          style={{
            width: '100%', padding: 10, borderRadius: 100, border: 'none',
            background: '#00E676', color: '#080808',
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          HMU
        </button>
      </div>
    </div>
  );
}
