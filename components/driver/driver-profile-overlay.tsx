'use client';

import { useEffect, useState } from 'react';

interface DriverProfileData {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  videoUrl: string | null;
  areas: string[];
  isHmuFirst: boolean;
  chillScore: number;
  completedRides: number;
  disputeCount: number;
  memberSince: string;
  ratings: Record<string, number>;
  totalRatings: number;
  acceptsCash: boolean;
  cashOnly: boolean;
  vehicle: { label: string; photoUrl: string | null; maxRiders: number | null } | null;
  pricing: { minimum: number; thirtyMin: number; hourly: number };
  services: { name: string; icon: string; price: number; pricingType: string }[];
  completionRate: number;
}

interface Props {
  handle: string;
  open: boolean;
  onClose: () => void;
}

const RATING_DISPLAY: Record<string, { label: string; emoji: string; color: string }> = {
  chill: { label: 'CHILL', emoji: '\u2705', color: '#00E676' },
  cool_af: { label: 'Cool AF', emoji: '\uD83D\uDE0E', color: '#448AFF' },
  kinda_creepy: { label: 'Kinda Creepy', emoji: '\uD83D\uDC40', color: '#FFD740' },
  weirdo: { label: 'WEIRDO', emoji: '\uD83D\uDEA9', color: '#FF5252' },
};

export default function DriverProfileOverlay({ handle, open, onClose }: Props) {
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);

  useEffect(() => {
    if (!open || !handle) return;
    setLoading(true);
    fetch(`/api/driver/${handle}`)
      .then(r => r.json())
      .then(data => {
        if (data.displayName) setProfile(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, handle]);

  if (!open) return null;

  const memberDate = profile?.memberSince
    ? new Date(profile.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <>
      <style>{`
        @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          animation: 'overlayIn 0.2s ease-out',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: '#0a0a0a', borderRadius: '24px 24px 0 0',
        maxHeight: '85vh', overflowY: 'auto',
        animation: 'sheetUp 0.3s ease-out',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        color: '#fff',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
            Loading...
          </div>
        )}

        {!loading && !profile && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#888', fontSize: 14 }}>
            Driver not found
          </div>
        )}

        {profile && (
          <div style={{ padding: '8px 20px 40px' }}>
            {/* Avatar + Name + Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    objectFit: 'cover', border: '3px solid rgba(255,255,255,0.1)',
                  }}
                />
              ) : (
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: '#1a1a1a', border: '3px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, fontWeight: 700, color: '#555',
                }}>
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{
                  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                  fontSize: 32, lineHeight: 1,
                }}>
                  {profile.displayName}
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  @{profile.handle}
                  {profile.isHmuFirst && (
                    <span style={{
                      background: 'rgba(0,230,118,0.12)', color: '#00E676',
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                    }}>
                      HMU 1ST
                    </span>
                  )}
                  {profile.acceptsCash && (
                    <span style={{
                      background: 'rgba(255,215,64,0.12)', color: '#FFD740',
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                    }}>
                      {profile.cashOnly ? 'CASH ONLY' : 'CASH OK'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Video intro */}
            {profile.videoUrl && (
              <div
                style={{
                  borderRadius: 16, overflow: 'hidden', marginBottom: 16,
                  position: 'relative', cursor: 'pointer',
                }}
                onClick={() => setVideoMuted(!videoMuted)}
              >
                <video
                  src={profile.videoUrl}
                  autoPlay
                  loop
                  muted={videoMuted}
                  playsInline
                  style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute', bottom: 10, right: 10,
                  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                  borderRadius: 100, padding: '6px 12px',
                  fontSize: 11, color: '#fff', fontWeight: 600,
                }}>
                  {videoMuted ? '\uD83D\uDD07 Tap for sound' : '\uD83D\uDD0A Sound on'}
                </div>
              </div>
            )}

            {/* Vehicle photo */}
            {!profile.videoUrl && profile.vehicle?.photoUrl && (
              <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
                <img
                  src={profile.vehicle.photoUrl}
                  alt="Vehicle"
                  style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }}
                />
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <StatCard label="Chill" value={`${profile.chillScore.toFixed(0)}%`} color="#00E676" />
              <StatCard label="Rides" value={String(profile.completedRides)} color="#fff" />
              <StatCard
                label="Disputes"
                value={String(profile.disputeCount)}
                color={profile.disputeCount === 0 ? '#00E676' : profile.disputeCount <= 2 ? '#FFD740' : '#FF5252'}
              />
              <StatCard label="Rate" value={`${profile.completionRate}%`} color="#448AFF" />
            </div>

            {/* Vehicle info */}
            {profile.vehicle && (
              <div style={{
                background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14, padding: '12px 16px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 22 }}>{'\uD83D\uDE97'}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{profile.vehicle.label}</div>
                  {profile.vehicle.maxRiders && (
                    <div style={{ fontSize: 11, color: '#888' }}>Up to {profile.vehicle.maxRiders} riders</div>
                  )}
                </div>
              </div>
            )}

            {/* Areas */}
            {profile.areas.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  fontSize: 10, color: '#888', letterSpacing: 3,
                  textTransform: 'uppercase', marginBottom: 8,
                }}>
                  Areas
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profile.areas.map(area => (
                    <span key={area} style={{
                      background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 100, padding: '4px 12px', fontSize: 12, color: '#ccc',
                    }}>
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing */}
            {(profile.pricing.minimum > 0 || profile.pricing.thirtyMin > 0) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  fontSize: 10, color: '#888', letterSpacing: 3,
                  textTransform: 'uppercase', marginBottom: 8,
                }}>
                  Pricing
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {profile.pricing.minimum > 0 && (
                    <PriceTag label="Min" value={`$${profile.pricing.minimum}`} />
                  )}
                  {profile.pricing.thirtyMin > 0 && (
                    <PriceTag label="30 min" value={`$${profile.pricing.thirtyMin}`} />
                  )}
                  {profile.pricing.hourly > 0 && (
                    <PriceTag label="1 hr" value={`$${profile.pricing.hourly}`} />
                  )}
                </div>
              </div>
            )}

            {/* Services / extras */}
            {profile.services.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  fontSize: 10, color: '#888', letterSpacing: 3,
                  textTransform: 'uppercase', marginBottom: 8,
                }}>
                  Extras
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {profile.services.map((s, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#141414', borderRadius: 10, padding: '8px 14px',
                    }}>
                      <span style={{ fontSize: 13 }}>{s.icon} {s.name}</span>
                      <span style={{ fontSize: 13, color: '#00E676', fontWeight: 600, fontFamily: "var(--font-mono, monospace)" }}>
                        ${s.price.toFixed(2)}{s.pricingType === 'per_unit' ? '/ea' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ratings breakdown */}
            {profile.totalRatings > 0 && (
              <>
                <div style={{
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  fontSize: 10, color: '#888', letterSpacing: 3,
                  textTransform: 'uppercase', marginBottom: 10,
                }}>
                  Ratings ({profile.totalRatings})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {Object.entries(RATING_DISPLAY).map(([type, info]) => {
                    const count = profile.ratings[type] || 0;
                    const pct = profile.totalRatings > 0 ? (count / profile.totalRatings) * 100 : 0;
                    return (
                      <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{info.emoji}</span>
                        <span style={{ fontSize: 12, color: info.color, width: 90, fontWeight: 600 }}>{info.label}</span>
                        <div style={{
                          flex: 1, height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: info.color, borderRadius: 3,
                            transition: 'width 0.5s ease-out',
                          }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#888', width: 24, textAlign: 'right', fontFamily: "var(--font-mono, monospace)" }}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {profile.totalRatings === 0 && (
              <div style={{
                background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14, padding: '16px 20px', textAlign: 'center',
                fontSize: 13, color: '#888', marginBottom: 16,
              }}>
                No ratings yet — new driver
              </div>
            )}

            {/* Member since */}
            {memberDate && (
              <div style={{ textAlign: 'center', fontSize: 11, color: '#555', marginBottom: 12 }}>
                Member since {memberDate}
              </div>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: 14, borderRadius: 100, marginTop: 4,
                border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                color: '#bbb', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: 1, background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14, padding: '10px 6px', textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 16, fontWeight: 700, color, lineHeight: 1.2,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function PriceTag({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '8px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#00E676', fontFamily: "var(--font-mono, monospace)" }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: '#888', letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
}
