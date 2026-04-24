'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import CelebrationConfetti from '@/components/shared/celebration-confetti';

const InlinePaymentForm = dynamic(() => import('@/components/payments/inline-payment-form'), { ssr: false });

interface Props {
  onComplete: () => void;
  isCash: boolean;
}

/**
 * Express onboarding for riders coming through the chat booking flow.
 * Collects only the display name (+ payment method if digital ride).
 * Everything else auto-populates from Clerk and can be updated later.
 */
export function ExpressRiderOnboarding({ onComplete, isCash }: Props) {
  const { user } = useUser();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'name' | 'payment' | 'done'>('name');
  const [error, setError] = useState<string | null>(null);

  // Pre-fill display name from Clerk
  useEffect(() => {
    if (user?.firstName && !displayName) {
      setDisplayName(user.firstName);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = user?.firstName
    ? [user.firstName, `${user.firstName} ${(user.lastName || 'A').charAt(0)}.`, `${user.firstName} ATL`]
    : [];

  const handleNameSubmit = async () => {
    if (!displayName.trim()) {
      setError('Pick a name so your driver knows who to look for');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const firstName = user?.firstName || displayName.split(' ')[0] || displayName;
      const lastName = user?.lastName || displayName.split(' ').slice(1).join(' ') || '.';
      const phone = user?.primaryPhoneNumber?.phoneNumber || '';

      await fetch('/api/users/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_type: 'rider',
          first_name: firstName,
          last_name: lastName,
          display_name: displayName.trim(),
          phone: phone || null,
          gender: null,
          pronouns: null,
          lgbtq_friendly: false,
        }),
      });

      // Save draft booking data server-side so it survives device changes
      try {
        const driverHandle = extractDriverHandleFromUrl();
        if (driverHandle) {
          const chatKey = `hmu_chat_booking_${driverHandle}`;
          const legacyKey = 'hmu_chat_booking';
          const raw = localStorage.getItem(chatKey) || localStorage.getItem(legacyKey);
          if (raw) {
            await fetch('/api/rider/draft-booking', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ driverHandle, bookingData: JSON.parse(raw) }),
            });
          }
        }
      } catch { /* non-critical */ }

      if (isCash) {
        // Cash ride — no payment needed, done!
        setStep('done');
        setTimeout(onComplete, 800);
      } else {
        // Digital ride — need payment method
        setStep('payment');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setSaving(false);
  };

  const handlePaymentSuccess = () => {
    setStep('done');
    setTimeout(onComplete, 800);
  };

  if (step === 'done') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50, background: '#080808',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }}>
        <CelebrationConfetti active variant="cannon" />
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(0,230,118,0.15)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#00E676', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Check className="w-7 h-7 text-black" strokeWidth={3} />
          </div>
        </div>
        <h1 style={{
          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
          fontSize: 36, color: '#fff', lineHeight: 1, marginBottom: 8,
        }}>
          YOU&apos;RE IN!
        </h1>
        <p style={{ fontSize: 14, color: '#888', textAlign: 'center' }}>
          Taking you back to finish your booking...
        </p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100svh', background: '#080808', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 24px 40px',
    }}>
      <div style={{ maxWidth: 380, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{
            display: 'inline-block', background: 'rgba(0,230,118,0.12)',
            color: '#00E676', fontSize: 10, fontWeight: 700,
            padding: '4px 12px', borderRadius: 100, letterSpacing: 1,
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            {step === 'payment' ? 'Link Payment' : 'Quick Setup'}
          </span>
          <h1 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 32, color: '#fff', lineHeight: 1, marginBottom: 8,
          }}>
            {step === 'payment' ? 'LINK A PAYMENT METHOD' : 'WHAT SHOULD YOUR DRIVER CALL YOU?'}
          </h1>
          <p style={{ fontSize: 14, color: '#888', lineHeight: 1.5 }}>
            {step === 'payment'
              ? 'Your payment is held until the ride is done — never charged early.'
              : 'Pick a display name. You can update your full profile later.'}
          </p>
        </div>

        {step === 'name' && (
          <>
            {/* Display name input */}
            <input
              type="text"
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setError(null); }}
              placeholder="Your display name"
              autoFocus
              style={{
                width: '100%', padding: '16px 20px', borderRadius: 14,
                border: '1px solid rgba(0,230,118,0.3)', background: '#141414',
                color: '#fff', fontSize: 18, outline: 'none',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            />

            {/* Quick picks */}
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDisplayName(s)}
                    style={{
                      padding: '8px 16px', borderRadius: 100, fontSize: 13,
                      border: displayName === s ? '2px solid #00E676' : '2px solid rgba(255,255,255,0.12)',
                      background: displayName === s ? 'rgba(0,230,118,0.1)' : 'transparent',
                      color: displayName === s ? '#fff' : '#bbb',
                      cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Privacy note */}
            <div style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12, padding: '12px 14px', marginTop: 16,
            }}>
              <span style={{ fontSize: 16 }}>&#128274;</span>
              <span style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
                Your real name stays private. Drivers only see your display name.
              </span>
            </div>

            {error && (
              <p style={{ fontSize: 13, color: '#FF4444', marginTop: 10, textAlign: 'center' }}>{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleNameSubmit}
              disabled={saving || !displayName.trim()}
              style={{
                width: '100%', padding: 18, borderRadius: 100, border: 'none',
                background: displayName.trim() ? '#00E676' : 'rgba(0,230,118,0.2)',
                color: '#080808', fontSize: 17, fontWeight: 800, cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                marginTop: 20, opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Setting up...' : isCash ? "Let's Go" : 'Next — Link Payment'}
            </button>

            {/* Legal */}
            <p style={{
              fontSize: 10, color: '#555', textAlign: 'center',
              marginTop: 12, lineHeight: 1.5, maxWidth: 300, margin: '12px auto 0',
            }}>
              By continuing, you agree to our{' '}
              <a href="/terms" style={{ color: '#00E676' }}>Terms</a> &amp;{' '}
              <a href="/privacy" style={{ color: '#00E676' }}>Privacy Policy</a>.
            </p>
          </>
        )}

        {step === 'payment' && (
          <div style={{
            background: '#141414', border: '1px solid rgba(0,230,118,0.2)',
            borderRadius: 16, padding: 20,
          }}>
            <InlinePaymentForm onSuccess={handlePaymentSuccess} />
            <button
              type="button"
              onClick={() => {
                // Allow skipping — they'll be asked at COO time
                setStep('done');
                setTimeout(onComplete, 800);
              }}
              style={{
                width: '100%', marginTop: 14, padding: 12, borderRadius: 100,
                border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
                color: '#888', fontSize: 13, cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Skip — I&apos;ll add later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function extractDriverHandleFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo') || '';
    const match = returnTo.match(/\/d\/([^?/]+)/);
    return match ? match[1] : null;
  } catch { return null; }
}
