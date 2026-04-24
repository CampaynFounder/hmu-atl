'use client';

import { useCallback, useState } from 'react';

// Always-available distress tile on the active-ride screen.
// Different trigger than SafetyCheckOverlay: a single tap opens the sheet
// (not fat-finger-resistant because the SHEET itself requires a second
// intentional choice — no option lands an alert on a single accidental tap).

interface Props {
  rideId: string;
  // Rendered as a floating pill — parent decides placement via wrapper.
  variant?: 'pill' | 'inline';
}

export default function SafetyTile({ rideId, variant = 'pill' }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const getCoords = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 2000);
      navigator.geolocation.getCurrentPosition(
        (p) => { clearTimeout(timer); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        () => { clearTimeout(timer); resolve(null); },
        { enableHighAccuracy: false, timeout: 1500, maximumAge: 10_000 },
      );
    });
  }, []);

  const submitDistress = useCallback(async (kind: 'admin' | '911' | 'contact') => {
    setSubmitting(true);
    try {
      const coords = await getCoords();
      await fetch(`/api/rides/${rideId}/safety/distress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, lat: coords?.lat, lng: coords?.lng }),
      });
      try { navigator.vibrate?.(80); } catch { /* ignore */ }
    } catch (err) {
      console.error('distress post failed', err);
    } finally {
      setSubmitting(false);
      setOpen(false);
    }
  }, [rideId, getCoords]);

  const pillStyle: React.CSSProperties = variant === 'pill' ? {
    padding: '8px 12px',
    background: 'rgba(10,10,10,0.82)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,107,53,0.35)',
    borderRadius: 999,
    color: '#FF6B35',
    fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
  } : {
    padding: '12px 16px',
    background: 'transparent',
    border: '1px solid rgba(255,107,53,0.35)',
    borderRadius: 14,
    color: '#FF6B35',
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer', width: '100%',
    display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'center',
    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open safety options"
        style={pillStyle}
      >
        <span aria-hidden>🛡️</span>
        <span>Safety</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.currentTarget === e.target) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9100,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            color: '#fff',
          }}
        >
          <div style={{
            background: '#0a0a0a',
            borderTop: '1px solid rgba(255,107,53,0.3)',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            padding: '24px 20px',
            paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))',
          }}>
            <div style={{
              width: 40, height: 4, background: 'rgba(255,255,255,0.15)',
              borderRadius: 2, margin: '0 auto 16px',
            }} aria-hidden />

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🛡️</div>
              <h3 style={{
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                fontSize: 28, margin: 0, letterSpacing: 1,
              }}>
                SAFETY OPTIONS
              </h3>
              <p style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
                Your live location is attached to every option.
              </p>
            </div>

            <button
              onClick={() => submitDistress('admin')}
              disabled={submitting}
              style={{
                width: '100%', padding: '18px 20px', marginBottom: 10,
                background: '#FF6B35', color: '#080808', border: 'none', borderRadius: 16,
                fontSize: 16, fontWeight: 700, textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 14,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              <span style={{ fontSize: 22 }}>🛡️</span>
              <span style={{ flex: 1 }}>
                <div>Notify HMU Admin</div>
                <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
                  Silent alert to HMU team
                </div>
              </span>
            </button>

            <a
              href="tel:911"
              onClick={() => submitDistress('911')}
              style={{
                width: '100%', padding: '18px 20px', marginBottom: 10,
                background: '#FF2D2D', color: '#fff', border: 'none', borderRadius: 16,
                fontSize: 16, fontWeight: 700, textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: 22 }}>☎️</span>
              <span style={{ flex: 1 }}>
                <div>Call 911</div>
                <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
                  Opens your dialer now
                </div>
              </span>
            </a>

            <button
              onClick={() => setOpen(false)}
              disabled={submitting}
              style={{
                width: '100%', padding: '14px 20px',
                background: 'transparent', color: '#888',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
