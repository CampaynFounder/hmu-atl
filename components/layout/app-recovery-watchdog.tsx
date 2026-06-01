'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { hardResetClientState } from '@/lib/client-recovery';

// Catches the "infinite spinner, no error thrown" failure — the app never
// crashes, it just never becomes usable. The most common cause is Clerk's JS
// failing to initialize on a flaky network (clerk.<host> didn't load, a stuck
// connection, a stale session left by a previous sign-out), which leaves every
// auth gate spinning forever and blocks sign-in.
//
// `useAuth().isLoaded` flipping true is our "Clerk initialized" signal. If it
// hasn't happened after the timeout, we surface a recovery card with a one-tap
// device reset (sign out + clear caches/SW/storage + fresh reload) — the same
// thing a phone restart accomplishes, without the restart.

const STUCK_AFTER_MS = 12_000;

export function AppRecoveryWatchdog() {
  const { isLoaded } = useAuth();
  const [stuck, setStuck] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    // Once Clerk loads, the render guard below hides the overlay — no state
    // reset needed here (and resetting synchronously would cascade renders).
    if (isLoaded) return;
    const t = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(t);
  }, [isLoaded]);

  if (isLoaded || !stuck) return null;

  return (
    <div
      role="alertdialog"
      aria-label="App is taking too long to load"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: 'rgba(8,8,8,0.96)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 12, opacity: 0.4 }}>🌀</div>
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 30,
          letterSpacing: 1,
          marginBottom: 8,
        }}
      >
        Taking too long?
      </div>
      <p style={{ fontSize: 14, color: '#9a9a9a', maxWidth: 320, marginBottom: 24, lineHeight: 1.5 }}>
        We couldn&apos;t finish loading. This clears stale data on your device and
        signs you in fresh — like restarting the app.
      </p>
      <button
        onClick={async () => {
          setResetting(true);
          await hardResetClientState('/sign-in');
        }}
        disabled={resetting}
        style={{
          padding: '14px 30px',
          borderRadius: 100,
          border: 'none',
          background: '#00E676',
          color: '#080808',
          fontSize: 15,
          fontWeight: 700,
          cursor: resetting ? 'default' : 'pointer',
          opacity: resetting ? 0.6 : 1,
          marginBottom: 12,
        }}
      >
        {resetting ? 'Resetting…' : 'Reset & sign in'}
      </button>
      <button
        onClick={() => {
          window.location.href = window.location.href;
        }}
        style={{
          padding: '10px 24px',
          borderRadius: 100,
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'transparent',
          color: '#bbb',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Just reload
      </button>
    </div>
  );
}
