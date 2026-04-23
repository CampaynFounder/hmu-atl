'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

interface LinkedDriver {
  driverId: string;
  handle: string;
  displayName: string;
  areas: string[];
  minPrice: number;
  videoUrl: string | null;
  photoUrl: string | null;
  chillScore: number;
  isHmuFirst: boolean;
  lgbtqFriendly: boolean;
  acceptsCash: boolean;
  cashOnly: boolean;
  fwu: boolean;
  hasVibeVideo: boolean;
  payoutReady: boolean;
  vehicleSummary: string | null;
}

interface Props {
  drivers: LinkedDriver[];
}

export default function LinkedClient({ drivers }: Props) {
  const [list, setList] = useState(drivers);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleUnlink = useCallback(async (driverId: string) => {
    if (unlinking) return;
    const prev = list;
    setUnlinking(driverId);
    setList((curr) => curr.filter((d) => d.driverId !== driverId));
    try {
      const res = await fetch(`/api/rider/linked/${driverId}/unlink`, { method: 'POST' });
      if (!res.ok) {
        setList(prev);
        setToast('Could not unlink — try again.');
      } else {
        setToast('Unlinked');
      }
    } catch {
      setList(prev);
      setToast('Network error.');
    } finally {
      setUnlinking(null);
      window.setTimeout(() => setToast(null), 2500);
    }
  }, [unlinking, list]);

  return (
    <div
      style={{
        background: '#080808',
        color: '#fff',
        minHeight: '100svh',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        padding: '72px 20px 40px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1
          style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: '32px',
            margin: 0,
          }}
        >
          Linked
        </h1>
        <Link
          href="/rider/home"
          style={{
            fontSize: '14px',
            color: '#00E676',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Back
        </Link>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: 80, left: 20, right: 20, zIndex: 50,
          background: '#141414', border: '1px solid rgba(0,230,118,0.3)',
          borderRadius: 14, padding: '12px 16px',
          fontSize: 14, color: '#fff', textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        }}>
          {toast}
        </div>
      )}

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>{'🔗'}</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            No linked drivers yet
          </div>
          <div style={{ fontSize: '14px', color: '#888', lineHeight: 1.5 }}>
            When a driver HMUs you and you Link, they show up here.
          </div>
          <Link
            href="/rider/browse"
            style={{
              display: 'inline-block', marginTop: 20,
              padding: '10px 20px', borderRadius: 100,
              border: '1px solid rgba(0,230,118,0.3)', color: '#00E676',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            Browse drivers
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {list.map((driver) => (
            <div
              key={driver.driverId}
              style={{
                background: '#141414',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                overflow: 'hidden',
              }}
            >
              {(driver.photoUrl || driver.videoUrl) && (
                <div style={{ width: '100%', aspectRatio: '4 / 3', overflow: 'hidden', position: 'relative', background: '#0A0A0A' }}>
                  {driver.videoUrl ? (
                    <video src={driver.videoUrl} muted playsInline loop autoPlay
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
                  ) : driver.photoUrl ? (
                    <img src={driver.photoUrl} alt={driver.displayName}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
                  ) : null}
                </div>
              )}

              <div style={{ padding: '16px 20px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>{driver.displayName}</div>
                  {driver.isHmuFirst && (
                    <span style={{
                      display: 'inline-block', background: '#00E676', color: '#080808',
                      fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px',
                      letterSpacing: '1px', textTransform: 'uppercase',
                    }}>
                      {'🥇'} HMU 1st
                    </span>
                  )}
                  {driver.fwu && (
                    <span style={{
                      display: 'inline-block', background: 'rgba(255,145,0,0.15)',
                      border: '1px solid rgba(255,145,0,0.3)', color: '#FF9100',
                      fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px',
                      letterSpacing: '1px', textTransform: 'uppercase',
                    }}>FWU</span>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                  @{driver.handle}
                </div>

                {driver.vehicleSummary && (
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🚗</span>
                    <span>{driver.vehicleSummary}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                      fontSize: '20px', color: '#00E676',
                    }}>
                      {driver.chillScore.toFixed(0)}%
                    </span>
                    <span style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Chill</span>
                  </div>
                  {driver.minPrice > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{
                        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                        fontSize: '20px', color: '#fff', lineHeight: 1,
                      }}>
                        ${driver.minPrice}+
                      </span>
                      <span style={{ fontSize: '9px', color: '#888', letterSpacing: '0.5px' }}>starts at</span>
                    </div>
                  )}
                </div>

                {driver.areas.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                    {driver.areas.slice(0, 4).map((area) => (
                      <span key={area} style={{
                        background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px', padding: '4px 10px', fontSize: '11px', color: '#bbb',
                      }}>{area}</span>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link
                    href={`/d/${driver.handle}`}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '100px',
                      background: '#00E676', color: '#080808',
                      fontWeight: 700, fontSize: '15px',
                      textAlign: 'center', textDecoration: 'none',
                      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    }}
                  >
                    Book
                  </Link>
                  <button
                    onClick={() => handleUnlink(driver.driverId)}
                    disabled={unlinking === driver.driverId}
                    style={{
                      padding: '12px 16px', borderRadius: '100px',
                      border: '1px solid rgba(255,82,82,0.25)', background: 'transparent',
                      color: '#FF5252', fontSize: '13px', fontWeight: 600,
                      cursor: unlinking === driver.driverId ? 'not-allowed' : 'pointer',
                      opacity: unlinking === driver.driverId ? 0.5 : 1,
                      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    }}
                  >
                    {unlinking === driver.driverId ? 'Unlinking…' : 'Unlink'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
