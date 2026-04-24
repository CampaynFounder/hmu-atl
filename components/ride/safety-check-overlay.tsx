'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { SafetyCheckResponse } from '@/lib/db/types';

// Fat-finger-resistant check-in prompt.
// Layout:
//   - Big green "All good" button bottom-center — one-tap dismiss (common case)
//   - Small orange "Something's off" button top-right — HOLD 1s to escalate
//     (never a single tap — prevents accidental alerts on pocket presses)
//   - No tap-outside dismissal
//   - Auto-dismiss at autoDismissSeconds → logged as 'ignored'
//
// The overlay owns its own POST; parent just listens for onResolved to tear down.

interface Props {
  rideId: string;
  checkId: string;
  autoDismissSeconds: number;
  onResolved: (response: SafetyCheckResponse) => void;
}

const HOLD_DURATION_MS = 1000;

type Phase = 'prompt' | 'alert_sheet' | 'submitting';

export default function SafetyCheckOverlay({ rideId, checkId, autoDismissSeconds, onResolved }: Props) {
  const [phase, setPhase] = useState<Phase>('prompt');
  const [secondsLeft, setSecondsLeft] = useState(autoDismissSeconds);
  const [holdProgress, setHoldProgress] = useState(0); // 0..1
  const [error, setError] = useState<string | null>(null);

  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);

  // Fetch current GPS at response time (best-effort, 2s timeout). Coords are
  // persisted with the check so admin can see exactly where the rider/driver
  // tapped the button.
  const getCoords = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 2000);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => { clearTimeout(timer); resolve(null); },
        { enableHighAccuracy: false, timeout: 1500, maximumAge: 10_000 },
      );
    });
  }, []);

  const submit = useCallback(async (
    response: SafetyCheckResponse,
    distress?: 'admin' | '911' | 'contact',
  ) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setPhase('submitting');
    try {
      const coords = await getCoords();
      await fetch(`/api/rides/${rideId}/safety/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId, response, lat: coords?.lat, lng: coords?.lng, distress }),
      });
    } catch (err) {
      console.error('safety respond failed', err);
      // Still fall through — parent UI un-mounts either way so user isn't stuck.
    }
    onResolved(response);
  }, [rideId, checkId, getCoords, onResolved]);

  // Countdown → auto-ignore
  useEffect(() => {
    if (phase === 'submitting') return;
    if (secondsLeft <= 0) { submit('ignored'); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, phase, submit]);

  // Hold-to-activate handlers for "Something's off"
  const startHold = useCallback(() => {
    if (phase !== 'prompt') return;
    holdStartRef.current = performance.now();
    const tick = () => {
      if (holdStartRef.current == null) return;
      const elapsed = performance.now() - holdStartRef.current;
      const pct = Math.min(1, elapsed / HOLD_DURATION_MS);
      setHoldProgress(pct);
      if (pct >= 1) {
        holdStartRef.current = null;
        setHoldProgress(0);
        try { navigator.vibrate?.([30, 40, 30]); } catch { /* iOS Safari no-op */ }
        setPhase('alert_sheet');
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [phase]);

  const cancelHold = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    holdStartRef.current = null;
    setHoldProgress(0);
  }, []);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Safety check-in"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        color: '#fff',
      }}
    >
      {/* TOP-RIGHT: hold-to-alert — spatially distant from bottom "All good" */}
      {phase === 'prompt' && (
        <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 2 }}>
          <button
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            style={{
              position: 'relative',
              padding: '10px 16px', borderRadius: 999,
              background: holdProgress > 0 ? 'rgba(255,107,53,0.25)' : 'rgba(255,107,53,0.12)',
              border: '1.5px solid #FF6B35',
              color: '#FF6B35', fontSize: 12, fontWeight: 700,
              letterSpacing: 0.5, textTransform: 'uppercase',
              cursor: 'pointer', userSelect: 'none', touchAction: 'manipulation',
            }}
          >
            <span>Something&apos;s off — hold</span>
            {/* Progress ring */}
            {holdProgress > 0 && (
              <span
                aria-hidden
                style={{
                  position: 'absolute', inset: -3, borderRadius: 999,
                  border: '3px solid transparent',
                  borderTopColor: '#FF6B35',
                  borderRightColor: holdProgress > 0.25 ? '#FF6B35' : 'transparent',
                  borderBottomColor: holdProgress > 0.5 ? '#FF6B35' : 'transparent',
                  borderLeftColor: holdProgress > 0.75 ? '#FF6B35' : 'transparent',
                  transform: `rotate(${holdProgress * 360}deg)`,
                  transition: 'transform 16ms linear',
                }}
              />
            )}
          </button>
        </div>
      )}

      {/* CENTER: prompt */}
      {phase === 'prompt' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '0 28px',
        }}>
          <div style={{ fontSize: 40, marginBottom: 24 }} aria-hidden>🛟</div>
          <h2 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 44, lineHeight: 1, textAlign: 'center', margin: 0, letterSpacing: 1,
          }}>
            YOU GOOD?
          </h2>
          <p style={{
            fontSize: 15, textAlign: 'center', color: '#bbb',
            marginTop: 16, maxWidth: 320, lineHeight: 1.5,
          }}>
            Quick safety check-in. Tap <strong style={{ color: '#00E676' }}>All good</strong> if
            everything&apos;s chill. If not, <strong style={{ color: '#FF6B35' }}>hold the button top-right</strong>.
          </p>
          <div style={{
            marginTop: 28,
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            fontSize: 11, color: '#555', letterSpacing: 2, textTransform: 'uppercase',
          }}>
            auto-closes in {secondsLeft}s
          </div>
        </div>
      )}

      {/* BOTTOM: one-tap "All good" */}
      {phase === 'prompt' && (
        <div style={{ padding: '0 20px 32px', paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))' }}>
          <button
            onClick={() => submit('ok')}
            style={{
              width: '100%', padding: '22px 24px',
              background: '#00E676', color: '#080808',
              border: 'none', borderRadius: 100,
              fontSize: 20, fontWeight: 800, letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(0,230,118,0.35)',
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            }}
          >
            ALL GOOD 👍
          </button>
        </div>
      )}

      {/* ALERT SHEET — after 1s hold */}
      {phase === 'alert_sheet' && (
        <AlertSheet
          onChoose={async (choice) => {
            if (choice === 'false_alarm') { submit('ok'); return; }
            if (choice === 'admin') { submit('alert', 'admin'); return; }
            if (choice === '911') {
              // Fire-and-forget distress record; tel: link navigates user away.
              submit('alert', '911');
              // Don't intercept tel: — it's handled by the href click below.
            }
          }}
        />
      )}

      {phase === 'submitting' && (
        <div style={{ margin: 'auto', color: '#aaa', fontSize: 14 }}>
          Sending…
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute', bottom: 110, left: 20, right: 20,
          background: 'rgba(255,82,82,0.15)', color: '#FF5252',
          padding: 12, borderRadius: 10, fontSize: 13, textAlign: 'center',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function AlertSheet({ onChoose }: { onChoose: (choice: 'admin' | '911' | 'false_alarm') => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end',
    }}>
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>🚨</div>
          <h3 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 28, margin: 0, letterSpacing: 1,
          }}>
            WHAT&apos;S UP?
          </h3>
          <p style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
            Pick one. Your location is sent with every option.
          </p>
        </div>

        <button
          onClick={() => onChoose('admin')}
          style={{
            width: '100%', padding: '18px 20px', marginBottom: 10,
            background: '#FF6B35', color: '#080808', border: 'none', borderRadius: 16,
            fontSize: 16, fontWeight: 700, textAlign: 'left', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <span style={{ fontSize: 22 }}>🛡️</span>
          <span style={{ flex: 1 }}>
            <div>Notify HMU Admin</div>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
              Silent alert with your live location
            </div>
          </span>
        </button>

        <a
          href="tel:911"
          onClick={() => onChoose('911')}
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
          onClick={() => onChoose('false_alarm')}
          style={{
            width: '100%', padding: '14px 20px',
            background: 'transparent', color: '#888',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Never mind — I&apos;m good
        </button>
      </div>
    </div>
  );
}
