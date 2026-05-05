'use client';

import { useEffect, useState } from 'react';
import { parseTimeShorthand } from '@/lib/utils/time-parser';
import { posthog } from '@/components/analytics/posthog-provider';
import type { BrowseDriverRow } from '@/lib/hmu/browse-drivers-query';

interface Props {
  driver: BrowseDriverRow;
  onClose: () => void;
  isAuthenticated?: boolean;
}

/**
 * Bottom-sheet booking flow for /rider/browse. Digital-only in this surface
 * (cash toggle hidden) and PM gate is deferred to /api/rides/[id]/coo
 * (Pull Up). Anon riders submit → /api/public/draft-booking → continue to
 * sign-up/sign-in with the draft id; auth-callback consumes the draft and
 * forwards it to /api/drivers/[handle]/book.
 */
export default function BookingDrawer({ driver, onClose, isAuthenticated = true }: Props) {
  const { handle, displayName, minPrice, enforceMinimum, fwu, videoUrl, photoUrl } = driver;
  const defaultAmount = (minPrice > 0 && !fwu) ? String(minPrice) : '15';

  const [destination, setDestination] = useState('');
  const [time, setTime] = useState('');
  const [amount, setAmount] = useState(defaultAmount);
  const [recurring, setRecurring] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  // Anon path — once a draft is parked, drawer offers Sign Up / Sign In CTAs.
  const [draftId, setDraftId] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount) || 0;
  const belowMin = enforceMinimum && minPrice > 0 && parsedAmount > 0 && parsedAmount < minPrice;
  const parsedTime = parseTimeShorthand(time);

  // Lock body scroll while the sheet is open so the page underneath doesn't
  // scroll when the user drags within the form.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  async function handleSubmit() {
    if (!destination.trim()) { setError('Where you going?'); return; }
    if (parsedAmount < 1) { setError('Minimum $1'); return; }
    if (belowMin) return;

    setSubmitting(true);
    setError(null);

    const timeWindow = {
      destination: destination.trim(),
      time: parsedTime.display,
      message: `${destination.trim()} $${parsedAmount} ${parsedTime.display}`,
    };

    try {
      if (!isAuthenticated) {
        // Anon path: park the draft and let the user pick sign-up/sign-in.
        const res = await fetch('/api/public/draft-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle, price: parsedAmount, timeWindow }),
        });
        const data = await res.json();
        if (res.ok) {
          posthog.capture('public_draft_booking_created', {
            driverHandle: handle, price: parsedAmount, recurringInterest: recurring,
          });
          setDraftId(data.draftId as string);
        } else {
          setError(data.error || 'Failed to save your request. Try again.');
        }
        setSubmitting(false);
        return;
      }

      // Authed path — existing direct-booking endpoint, digital only.
      const res = await fetch(`/api/drivers/${handle}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: parsedAmount,
          is_cash: false,
          timeWindow,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        posthog.capture('direct_booking_sent', {
          driverHandle: handle, price: parsedAmount, destination: destination.trim(), isCash: false,
        });
        setExpiresAt((data.expiresAt as string) || null);
        setSuccess(true);
      } else if (res.status === 409 && data.postId) {
        setActiveBookingId(data.postId);
        setError('You already have a pending request with this driver');
      } else {
        setError(data.error || 'Failed to send');
      }
    } catch {
      setError('Network error');
    }
    setSubmitting(false);
  }

  async function handleCancelBooking() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/drivers/${handle}/book`, { method: 'DELETE' });
      if (res.ok) {
        setActiveBookingId(null);
        setError(null);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to cancel');
      }
    } catch {
      setError('Network error');
    }
    setCancelling(false);
  }

  function authQueryString(): string {
    const p = new URLSearchParams();
    p.set('type', 'rider');
    if (draftId) p.set('draft', draftId);
    p.set('handle', handle);
    return p.toString();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        color: '#fff',
      }}
    >
      <div style={{
        background: '#0a0a0a',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '20px 20px',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        maxHeight: '90svh', overflowY: 'auto',
      }}>
        <div style={{
          width: 40, height: 4, background: 'rgba(255,255,255,0.15)',
          borderRadius: 2, margin: '0 auto 14px',
        }} aria-hidden />

        {draftId ? (
          // Anon → continue to auth.
          <div style={{ padding: '8px 8px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>👋</div>
            <div style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 22, color: '#00E676', marginBottom: 10,
            }}>
              ALMOST THERE
            </div>
            {/* Recap — show the rider exactly what they're committing to so
                they trust the system before they leave for sign-up. */}
            <div style={{
              display: 'inline-block',
              padding: '10px 16px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              marginBottom: 14, textAlign: 'left', maxWidth: '100%',
            }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Your request
              </div>
              <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, lineHeight: 1.4 }}>
                ${parsedAmount} to {destination.trim()}
                {parsedTime.display ? ` · ${parsedTime.display}` : ''}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                Going to {displayName}
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#ccc', marginBottom: 18, lineHeight: 1.5 }}>
              Sign up or sign in and we&apos;ll send it the moment your card is on file.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
              <a
                href={`/sign-up?${authQueryString()}`}
                style={{
                  display: 'block', padding: '14px 18px', borderRadius: 100,
                  background: '#00E676', color: '#080808',
                  fontWeight: 700, fontSize: 15, textDecoration: 'none',
                  fontFamily: 'inherit',
                }}
              >
                I&apos;m new — Sign Up
              </a>
              <a
                href={`/sign-in?${authQueryString()}`}
                style={{
                  display: 'block', padding: '14px 18px', borderRadius: 100,
                  border: '1px solid rgba(255,255,255,0.18)', background: 'transparent',
                  color: '#fff',
                  fontWeight: 600, fontSize: 14, textDecoration: 'none',
                  fontFamily: 'inherit',
                }}
              >
                I have an account — Sign In
              </a>
              <button
                type="button"
                onClick={onClose}
                style={{
                  marginTop: 4, padding: 10, borderRadius: 100,
                  background: 'transparent', color: '#888',
                  border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Maybe later
              </button>
            </div>
          </div>
        ) : success ? (
          <div style={{ padding: '24px 8px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{'✅'}</div>
            <div style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 22, color: '#00E676', marginBottom: 6,
            }}>
              SENT TO {displayName.toUpperCase()}
            </div>
            {expiresAt ? (
              <ExpiryCountdown expiresAt={expiresAt} driverName={displayName} />
            ) : (
              <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>
                They have 15 min to accept. You&apos;ll get a notification.
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '12px 28px', borderRadius: 100, border: 'none',
                background: '#00E676', color: '#080808', fontWeight: 700, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Driver media — video first (autoplay, muted, looped) then photo
                then fallback gradient. Mirrors the feed/grid card aesthetic
                so the rider has visual continuity from card → drawer.
                Container is 4:3; video uses object-fit:contain so portrait
                phone videos show in full (no top crop). Photos use cover
                with center-top focus since they tend to be face-centric. */}
            <div style={{
              width: '100%',
              aspectRatio: '4 / 3',
              borderRadius: 16,
              overflow: 'hidden',
              background: '#000',
              marginBottom: 14,
              position: 'relative',
            }}>
              {videoUrl ? (
                <video
                  src={videoUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
              ) : photoUrl ? (
                <img
                  src={photoUrl}
                  alt={displayName}
                  style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: 'center top',
                    display: 'block',
                  }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                  fontSize: 56, color: '#444',
                  background: 'radial-gradient(circle at 50% 40%, #1a1a1a, #0a0a0a)',
                }}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Subtle gradient + name overlay so the driver's name is
                  unmistakable even when the media is busy. */}
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                padding: '24px 14px 10px',
                background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0))',
                pointerEvents: 'none',
              }}>
                <div style={{
                  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                  fontSize: 22, color: '#fff', lineHeight: 1.05,
                }}>
                  BOOK {displayName.toUpperCase()}
                </div>
                <div style={{ fontSize: 12, color: '#bbb', marginTop: 2 }}>
                  Send them where you&apos;re headed and how much.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Pickup > Dropoff (e.g. airport > buckhead)"
                  style={{ ...inputStyle, width: '100%' }}
                />
                <div style={{ fontSize: 11, color: '#888', marginTop: 4, paddingLeft: 4 }}>
                  Add stops & details later.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="When? (now, tonight, 2pm)"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div style={{ position: 'relative', width: 100 }}>
                  <span style={{
                    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                    color: '#00E676', fontSize: 16, fontWeight: 700, pointerEvents: 'none',
                  }}>$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    style={{
                      ...inputStyle,
                      width: '100%',
                      padding: '12px 14px 12px 28px',
                      border: belowMin ? '1px solid #FF5252' : inputStyle.border,
                    }}
                  />
                </div>
              </div>

              {/* Recurring toggle — disabled "Coming soon" placeholder. Tapping
                  the row opens the email capture modal so we can build the
                  early-access list. */}
              <button
                type="button"
                onClick={() => {
                  setShowRecurringModal(true);
                  posthog.capture('recurring_toggle_interest_shown', { driverHandle: handle });
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12, padding: '10px 14px', textAlign: 'left',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Recurring ride
                    <span style={{
                      padding: '2px 8px', borderRadius: 100,
                      background: 'rgba(255,179,0,0.12)', color: '#FFB300',
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                    }}>
                      Coming Soon
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    Daily/weekly rides — same driver, same price.
                  </div>
                </div>
                <div style={{
                  width: 48, height: 28, borderRadius: 14,
                  background: 'rgba(255,255,255,0.06)',
                  position: 'relative',
                  opacity: 0.6,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: '#444',
                    position: 'absolute', top: 3, left: 3,
                  }} />
                </div>
              </button>

              {belowMin && (
                <div style={{
                  fontSize: 12, color: '#FF5252', padding: '6px 10px',
                  background: 'rgba(255,82,82,0.08)', borderRadius: 8,
                }}>
                  this driver says dont hmu for less than ${minPrice}
                </div>
              )}

              {time && parsedTime.display !== time && (
                <div style={{ fontSize: 11, color: '#888' }}>
                  {parsedTime.display}
                </div>
              )}

              {error && (
                <div style={{ fontSize: 12, color: '#FF5252' }}>{error}</div>
              )}

              {activeBookingId && (
                <button
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  style={{
                    width: '100%', padding: 12, borderRadius: 100,
                    border: '1px solid rgba(255,82,82,0.3)', background: 'transparent',
                    color: '#FF5252', fontSize: 13, fontWeight: 600,
                    cursor: cancelling ? 'not-allowed' : 'pointer',
                    opacity: cancelling ? 0.5 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Pending Request'}
                </button>
              )}

              {!isAuthenticated && (
                <div style={{
                  fontSize: 11, color: '#888', textAlign: 'center', padding: '4px 8px',
                }}>
                  We&apos;ll save your request and ask you to sign up before sending it.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1, padding: 14, borderRadius: 100,
                    background: 'transparent', color: '#bbb',
                    border: '1px solid rgba(255,255,255,0.12)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || belowMin}
                  style={{
                    flex: 1.4, padding: 14, borderRadius: 100, border: 'none',
                    background: belowMin ? '#333' : '#00E676',
                    color: belowMin ? '#888' : '#080808',
                    fontWeight: 700, fontSize: 15,
                    cursor: submitting || belowMin ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.5 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {submitting ? 'Sending...' : isAuthenticated ? `Send to ${displayName}` : 'Continue'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {showRecurringModal && (
        <RecurringInterestModal
          driverHandle={handle}
          onClose={() => setShowRecurringModal(false)}
          onCaptured={() => {
            setRecurring(true);
            setShowRecurringModal(false);
          }}
        />
      )}
    </div>
  );
}

function ExpiryCountdown({ expiresAt, driverName }: { expiresAt: string; driverName: string }) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  );

  useEffect(() => {
    const tick = () => {
      setRemainingMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const expired = remainingMs <= 0;
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const label = expired ? 'Expired' : `${mins}:${String(secs).padStart(2, '0')}`;
  // Under 2 minutes → urgent orange. Expired → red.
  const accent = expired ? '#FF5252' : remainingMs < 2 * 60 * 1000 ? '#FF9100' : '#00E676';

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 100,
        background: `${accent}1A`, border: `1px solid ${accent}4D`,
        fontFamily: "'Space Mono', monospace",
        fontSize: 18, fontWeight: 700, color: accent,
        letterSpacing: 1,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: accent,
          animation: expired ? 'none' : 'bookingPulse 1.2s ease-in-out infinite',
        }} />
        {label}
      </div>
      <style>{`@keyframes bookingPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`}</style>
      <div style={{ fontSize: 13, color: '#888', marginTop: 8, lineHeight: 1.5 }}>
        {expired
          ? `${driverName} didn't respond in time. Try another driver or HMU all drivers.`
          : `Time left for ${driverName} to accept. You'll get a notification.`}
      </div>
    </div>
  );
}

function RecurringInterestModal({
  driverHandle, onClose, onCaptured,
}: {
  driverHandle: string;
  onClose: () => void;
  onCaptured: () => void;
}) {
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim() || !email.includes('@')) {
      setError('Drop your email so we can hit you back.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/public/recurring-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          intendedFrequency: frequency || null,
          source: 'browse_drawer',
          driverHandle,
        }),
      });
      if (res.ok) {
        posthog.capture('recurring_interest_captured', { driverHandle, frequency });
        setDone(true);
        setTimeout(onCaptured, 1200);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to save. Try again.');
      }
    } catch {
      setError('Network error');
    }
    setSubmitting(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        background: '#141414', borderRadius: 20, padding: 22,
        maxWidth: 360, width: '100%',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
            <div style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 20, color: '#00E676', marginBottom: 4,
            }}>
              YOU&apos;RE ON THE LIST
            </div>
            <div style={{ fontSize: 13, color: '#888' }}>
              We&apos;ll hit you back when recurring rides drop.
            </div>
          </div>
        ) : (
          <>
            <div style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 22, marginBottom: 4, color: '#fff',
            }}>
              RECURRING RIDES INCOMING
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
              Same driver, same price, every day. Drop your email for early access.
            </div>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              style={{ ...modalInput, width: '100%', marginBottom: 10 }}
            />

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['daily', 'weekly'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(frequency === f ? '' : f)}
                  style={{
                    flex: 1, padding: 10, borderRadius: 12,
                    border: 'none', cursor: 'pointer',
                    background: frequency === f ? 'rgba(0,230,118,0.15)' : '#1a1a1a',
                    color: frequency === f ? '#00E676' : '#bbb',
                    fontWeight: 600, fontSize: 12,
                    fontFamily: 'inherit',
                    textTransform: 'capitalize',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#FF5252', marginBottom: 10 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1, padding: 12, borderRadius: 100,
                  background: 'transparent', color: '#bbb',
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Skip
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  flex: 1.4, padding: 12, borderRadius: 100, border: 'none',
                  background: '#00E676', color: '#080808',
                  fontWeight: 700, fontSize: 13, cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1, fontFamily: 'inherit',
                }}
              >
                {submitting ? 'Saving...' : 'Notify me'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '12px 14px',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
};

const modalInput: React.CSSProperties = {
  ...inputStyle,
  background: '#0d0d0d',
};
