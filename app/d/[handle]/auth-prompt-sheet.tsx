'use client';

// Bottom-sheet shown when chat booking is disabled for this driver and a
// logged-out rider taps HMU. Two buttons — Sign up (→ ExpressRiderOnboarding)
// and Sign in — both land the rider back on the driver profile with
// bookingOpen=1, which auto-opens the BookingDrawer (see
// driver-share-profile-client.tsx:124 autoOpenBooking effect).

interface Props {
  open: boolean;
  driverDisplayName: string;
  driverHandle: string;
  isCashOnly: boolean;
  onClose: () => void;
}

export default function AuthPromptSheet({ open, driverDisplayName, driverHandle, isCashOnly, onClose }: Props) {
  if (!open) return null;

  const returnPath = `/d/${driverHandle}?bookingOpen=1`;
  const cashParam = isCashOnly ? '&cash=1' : '';
  const signUpUrl = `/sign-up?type=rider&returnTo=${encodeURIComponent(returnPath)}${cashParam}`;
  const signInUrl = `/sign-in?type=rider&returnTo=${encodeURIComponent(returnPath)}${cashParam}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        color: '#fff',
      }}
    >
      <div style={{
        background: '#0a0a0a',
        borderTop: '1px solid rgba(0,230,118,0.25)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '24px 20px',
        paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))',
      }}>
        <div style={{
          width: 40, height: 4, background: 'rgba(255,255,255,0.15)',
          borderRadius: 2, margin: '0 auto 16px',
        }} aria-hidden />

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🚗</div>
          <h3 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 30, margin: 0, letterSpacing: 0.5, lineHeight: 1.05,
          }}>
            BOOK {driverDisplayName.toUpperCase()}
          </h3>
          <p style={{ fontSize: 13, color: '#888', marginTop: 6, maxWidth: 300, margin: '6px auto 0', lineHeight: 1.5 }}>
            {isCashOnly
              ? 'Cash ride. Sign up or sign in to lock it in.'
              : 'Sign up or sign in to lock in your ride.'}
          </p>
        </div>

        <a
          href={signUpUrl}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '16px 20px', marginBottom: 10,
            background: '#00E676', color: '#080808', border: 'none', borderRadius: 16,
            fontSize: 16, fontWeight: 800, letterSpacing: 0.5, textAlign: 'center',
            display: 'block', textDecoration: 'none', textTransform: 'uppercase' as const,
          }}
        >
          Sign up — new rider
        </a>

        <a
          href={signInUrl}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '14px 20px', marginBottom: 12,
            background: 'transparent', color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 16,
            fontSize: 15, fontWeight: 600, textAlign: 'center',
            display: 'block', textDecoration: 'none',
          }}
        >
          Sign in — already have an account
        </a>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '12px 20px',
            background: 'transparent', color: '#888',
            border: 'none', borderRadius: 16,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
