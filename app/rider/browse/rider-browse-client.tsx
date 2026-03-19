'use client';

import Link from 'next/link';

interface DriverCard {
  handle: string;
  displayName: string;
  areas: string[];
  minPrice: number;
  videoUrl: string | null;
  photoUrl: string | null;
  lgbtqFriendly: boolean;
  chillScore: number;
  isHmuFirst: boolean;
}

interface Props {
  drivers: DriverCard[];
}

export default function RiderBrowseClient({ drivers }: Props) {
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1
          style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: '32px',
            margin: 0,
          }}
        >
          Browse Drivers
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

      {drivers.length === 0 ? (
        /* Empty state */
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>
            {'\uD83D\uDE97'}
          </div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 600,
              marginBottom: '8px',
            }}
          >
            No drivers available right now
          </div>
          <div style={{ fontSize: '14px', color: '#888', lineHeight: 1.5 }}>
            Check back soon — drivers go live throughout the day.
          </div>
        </div>
      ) : (
        /* Driver list */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {drivers.map((driver) => (
            <Link
              key={driver.handle}
              href={`/d/${driver.handle}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  background: '#141414',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  transition: 'all 0.15s',
                }}
              >
                {/* Media thumbnail */}
                {(driver.photoUrl || driver.videoUrl) && (
                  <div
                    style={{
                      width: '100%',
                      height: '180px',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {driver.videoUrl ? (
                      <video
                        src={driver.videoUrl}
                        muted
                        playsInline
                        loop
                        autoPlay
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : driver.photoUrl ? (
                      <img
                        src={driver.photoUrl}
                        alt={driver.displayName}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : null}
                  </div>
                )}

                {/* Card content */}
                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Name row + badges */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                      }}
                    >
                      {driver.displayName}
                    </div>
                    {driver.isHmuFirst && (
                      <span
                        style={{
                          display: 'inline-block',
                          background: '#00E676',
                          color: '#080808',
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '100px',
                          letterSpacing: '1px',
                          textTransform: 'uppercase',
                        }}
                      >
                        HMU First
                      </span>
                    )}
                    {driver.lgbtqFriendly && (
                      <span
                        style={{
                          display: 'inline-block',
                          background: 'rgba(168,85,247,0.15)',
                          border: '1px solid rgba(168,85,247,0.3)',
                          color: '#A855F7',
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '100px',
                          letterSpacing: '1px',
                          textTransform: 'uppercase',
                        }}
                      >
                        LGBTQ+
                      </span>
                    )}
                  </div>

                  {/* Trust badge */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#00E676' }}>{'\u2713'}</span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#888',
                        fontWeight: 600,
                        letterSpacing: '0.5px',
                      }}
                    >
                      Identity Verified + Video Confirmed
                    </span>
                  </div>

                  {/* Stats row */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '16px',
                      alignItems: 'center',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        style={{
                          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                          fontSize: '20px',
                          color: '#00E676',
                        }}
                      >
                        {driver.chillScore.toFixed(0)}%
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#888',
                          textTransform: 'uppercase',
                          letterSpacing: '1px',
                        }}
                      >
                        Chill
                      </span>
                    </div>
                    {driver.minPrice > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span
                          style={{
                            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                            fontSize: '20px',
                            color: '#fff',
                          }}
                        >
                          ${driver.minPrice}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            color: '#888',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                          }}
                        >
                          Min
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Areas */}
                  {driver.areas.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {driver.areas.slice(0, 4).map((area) => (
                        <span
                          key={area}
                          style={{
                            background: '#1f1f1f',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            color: '#bbb',
                          }}
                        >
                          {area}
                        </span>
                      ))}
                      {driver.areas.length > 4 && (
                        <span
                          style={{
                            background: '#1f1f1f',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            color: '#888',
                          }}
                        >
                          +{driver.areas.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
