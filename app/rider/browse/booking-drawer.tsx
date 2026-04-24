'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { parseTimeShorthand } from '@/lib/utils/time-parser';
import { posthog } from '@/components/analytics/posthog-provider';
import type { BrowseDriverRow } from '@/lib/hmu/browse-drivers-query';

const InlinePaymentForm = dynamic(() => import('@/components/payments/inline-payment-form'), { ssr: false });

interface Props {
  driver: BrowseDriverRow;
  onClose: () => void;
}

/**
 * Bottom-sheet booking flow for /rider/browse. Mirrors the legacy InlineBookingForm
 * exactly — payment-method gate, cash toggle, time parser, below-min warning,
 * pending-request 409 handling — but presented as an overlay so it composes with
 * the new feed/grid layouts where there's no room to expand inline.
 */
export default function BookingDrawer({ driver, onClose }: Props) {
  const { handle, displayName, minPrice, enforceMinimum, fwu, acceptsCash, cashOnly } = driver;
  const defaultAmount = (minPrice > 0 && !fwu) ? String(minPrice) : '15';

  const [destination, setDestination] = useState('');
  const [time, setTime] = useState('');
  const [amount, setAmount] = useState(defaultAmount);
  const [isCash, setIsCash] = useState(cashOnly);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasPaymentMethod, setHasPaymentMethod] = useState<boolean | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const parsedAmount = parseFloat(amount) || 0;
  const belowMin = enforceMinimum && minPrice > 0 && parsedAmount > 0 && parsedAmount < minPrice;
  const parsedTime = parseTimeShorthand(time);

  useEffect(() => {
    if (cashOnly) { setHasPaymentMethod(true); return; }
    fetch('/api/rider/payment-methods')
      .then((r) => r.json())
      .then((data) => {
        const methods = data.methods || data.paymentMethods || [];
        setHasPaymentMethod(Array.isArray(methods) && methods.length > 0);
      })
      .catch(() => setHasPaymentMethod(false));
  }, [cashOnly]);

  // Lock body scroll while the sheet is open so the page underneath doesn't scroll
  // when the user drags within the form.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const needsPaymentMethod = !isCash && hasPaymentMethod === false;

  async function handleSubmit() {
    if (!destination.trim()) { setError('Where you going?'); return; }
    if (parsedAmount < 1) { setError('Minimum $1'); return; }
    if (belowMin) return;
    if (needsPaymentMethod) { setShowPaymentForm(true); return; }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/drivers/${handle}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: parsedAmount,
          is_cash: isCash,
          timeWindow: {
            destination: destination.trim(),
            time: parsedTime.display,
            message: `${destination.trim()} $${parsedAmount} ${parsedTime.display}`,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        posthog.capture('direct_booking_sent', {
          driverHandle: handle, price: parsedAmount, destination: destination.trim(), isCash,
        });
        setSuccess(true);
      } else if (data.code === 'no_payment_method') {
        setShowPaymentForm(true);
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

  function handlePaymentMethodSaved() {
    setHasPaymentMethod(true);
    setShowPaymentForm(false);
    setTimeout(() => handleSubmit(), 300);
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

        {success ? (
          <div style={{ padding: '24px 8px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{'✅'}</div>
            <div style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 22, color: '#00E676', marginBottom: 6,
            }}>
              SENT TO {displayName.toUpperCase()}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>
              They have 15 min to accept. You&apos;ll get a notification.
            </div>
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
            <div style={{ marginBottom: 14 }}>
              <h3 style={{
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                fontSize: 24, margin: 0,
              }}>
                BOOK {displayName.toUpperCase()}
              </h3>
              <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                Send them where you&apos;re headed and how much.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Where you headed? (e.g. midtown > airport)"
                style={inputStyle}
              />

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

              {acceptsCash && !cashOnly && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12, padding: '10px 14px',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>Cash Ride</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {isCash ? 'No payment method needed' : 'Payment verified before pickup'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsCash(!isCash); setShowPaymentForm(false); setError(null); }}
                    style={{
                      width: 48, height: 28, borderRadius: 14, border: 'none',
                      background: isCash ? '#00E676' : 'rgba(255,255,255,0.12)',
                      position: 'relative', cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: '#fff',
                      position: 'absolute', top: 3,
                      left: isCash ? 23 : 3,
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }} />
                  </button>
                </div>
              )}

              {cashOnly && (
                <div style={{
                  fontSize: 12, color: '#4CAF50', padding: '8px 12px',
                  background: 'rgba(76,175,80,0.08)', borderRadius: 10,
                }}>
                  This driver only accepts cash rides
                </div>
              )}

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

              {showPaymentForm && !isCash && (
                <div style={{
                  background: '#141414', border: '1px solid rgba(0,230,118,0.2)',
                  borderRadius: 14, padding: 16,
                }}>
                  <div style={{ fontSize: 13, color: '#00E676', fontWeight: 600, marginBottom: 4 }}>
                    Link a payment method
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
                    Required for digital rides. Your card is saved for one-tap booking.
                  </div>
                  <InlinePaymentForm onSuccess={handlePaymentMethodSaved} />
                </div>
              )}

              {needsPaymentMethod && !showPaymentForm && (
                <div style={{
                  fontSize: 12, color: '#FFB300', padding: '8px 12px',
                  background: 'rgba(255,179,0,0.08)', borderRadius: 10,
                }}>
                  You&apos;ll need to link a payment method for digital rides
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
                {!showPaymentForm && (
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
                    {submitting ? 'Sending...' : `Send to ${displayName}`}
                  </button>
                )}
              </div>
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
