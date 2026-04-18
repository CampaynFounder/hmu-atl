'use client';

import { useEffect, useRef, useState } from 'react';
import InlinePaymentForm from '@/components/payments/inline-payment-form';

interface SavedPaymentMethod {
  id: string;
  brand: string | null;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
}

/** Format time string to short readable format: Mon 03/31/26 2:00PM */
function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  // If it's already short/natural (e.g. "now", "tomorrow 2pm"), keep it
  if (timeStr.length < 20 && !timeStr.includes('T') && !timeStr.includes('2026')) return timeStr;
  // Try parsing as date
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days[d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  let hr = d.getHours();
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  const min = d.getMinutes();
  const minStr = min > 0 ? `:${String(min).padStart(2, '0')}` : '';
  return `${day} ${mm}/${dd}/${yy} ${hr}${minStr}${ampm}`;
}

interface DriverData {
  handle: string;
  displayName: string;
  areas: string[];
  pricing: Record<string, unknown>;
}

interface Props {
  driver: DriverData;
  open: boolean;
  onClose: () => void;
  prefill?: { price?: string; pickup?: string; dropoff?: string; time?: string; resolvedTime?: string; timeDisplay?: string; stops?: string; roundTrip?: boolean; isCash?: boolean; driverMinimum?: number; estimatedRideMinutes?: number } | null;
}

type DrawerState = 'form' | 'pending' | 'accepted' | 'expired' | 'error';

const EXPIRY_MINUTES = 15;

export default function BookingDrawer({ driver, open, onClose, prefill }: Props) {
  const [state, setState] = useState<DrawerState>('form');
  const [price, setPrice] = useState(
    prefill?.price || String(driver.pricing.minimum ?? driver.pricing.base_rate ?? '')
  );
  const [areas, setAreas] = useState<string[]>(driver.areas.slice(0, 1));
  const [pickup, setPickup] = useState(prefill?.pickup || '');
  const [dropoff, setDropoff] = useState(prefill?.dropoff || '');
  const [timeWindow, setTimeWindow] = useState(formatTime(prefill?.time || ''));

  // Update fields when prefill data arrives
  useEffect(() => {
    if (prefill) {
      if (prefill.price) setPrice(prefill.price);
      if (prefill.pickup) setPickup(prefill.pickup);
      if (prefill.dropoff) setDropoff(prefill.dropoff);
      if (prefill.time) setTimeWindow(formatTime(prefill.time));
    }
  }, [prefill]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCashRide = !!prefill?.isCash;
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[] | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);

  // Fetch saved payment methods for non-cash rides so the rider sees what
  // will be charged. If they have none, we inline the Stripe form so they
  // can link a card without leaving the drawer.
  useEffect(() => {
    if (!open || isCashRide) {
      setPaymentMethods(null);
      setShowAddPayment(false);
      return;
    }
    let cancelled = false;
    fetch('/api/rider/payment-methods')
      .then(r => r.ok ? r.json() : { methods: [] })
      .then(data => {
        if (cancelled) return;
        const methods = (data.methods || []) as SavedPaymentMethod[];
        setPaymentMethods(methods);
        setShowAddPayment(methods.length === 0);
      })
      .catch(() => { if (!cancelled) { setPaymentMethods([]); setShowAddPayment(true); } });
    return () => { cancelled = true; };
  }, [open, isCashRide]);

  const hasSavedMethod = !isCashRide && (paymentMethods?.length ?? 0) > 0;
  const paymentReady = isCashRide || hasSavedMethod;
  const defaultMethod = paymentMethods?.find(m => m.isDefault) || paymentMethods?.[0] || null;

  // Countdown timer
  useEffect(() => {
    if (state !== 'pending' || !expiresAt) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) {
        setState('expired');
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state, expiresAt]);

  const toggleArea = (area: string) => {
    setAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const driverMinimum = prefill?.driverMinimum || Number(driver.pricing.minimum) || 0;

  const handleSubmit = async () => {
    if (!price || !dropoff) {
      setError('Set a price and drop-off location.');
      return;
    }
    if (driverMinimum > 0 && Number(price) < driverMinimum) {
      setError(`${driver.displayName}'s minimum is $${driverMinimum} — bump it up to book.`);
      return;
    }
    if (!paymentReady) {
      setError('Link a payment method to confirm the booking.');
      setShowAddPayment(true);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/drivers/${driver.handle}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: Number(price),
          areas,
          timeWindow: {
            destination: [pickup, dropoff].filter(Boolean).join(' > '),
            pickup: pickup || '',
            dropoff: dropoff || '',
            time: timeWindow || '',
            resolvedTime: (prefill as Record<string, unknown>)?.resolvedTime || null,
            timeDisplay: (prefill as Record<string, unknown>)?.timeDisplay || null,
            stops: prefill?.stops || '',
            round_trip: prefill?.roundTrip || false,
            estimated_minutes: prefill?.estimatedRideMinutes || undefined,
          },
          is_cash: prefill?.isCash || false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        return;
      }
      setExpiresAt(new Date(data.expiresAt));
      setState('pending');

      // Booking submitted successfully — NOW clear localStorage and server draft
      try {
        localStorage.removeItem(`hmu_chat_booking_${driver.handle}`);
        localStorage.removeItem('hmu_chat_booking');
        fetch(`/api/rider/draft-booking?driverHandle=${driver.handle}`, { method: 'DELETE' }).catch(() => {});
      } catch { /* ignore */ }
    } catch {
      setError('Network error — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const countdownStr = `${mins}:${String(secs).padStart(2, '0')}`;

  if (!open) return null;

  return (
    <>
      <style>{`
        .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; }
        .drawer { position: fixed; bottom: 0; left: 0; right: 0; z-index: 101; background: #141414; border-top: 1px solid rgba(255,255,255,0.1); border-radius: 24px 24px 0 0; padding: 24px 20px 48px; max-height: 90svh; overflow-y: auto; }
        .drawer-handle { width: 40px; height: 4px; background: rgba(255,255,255,0.15); border-radius: 100px; margin: 0 auto 20px; }
        .drawer-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; margin-bottom: 20px; color: #fff; }
        .drawer-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 2px; font-family: var(--font-mono, monospace); margin-bottom: 8px; margin-top: 18px; }
        .drawer-input { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 14px 16px; color: #fff; font-size: 16px; width: 100%; outline: none; font-family: var(--font-body, 'DM Sans', sans-serif); transition: border-color 0.2s; }
        .drawer-input:focus { border-color: #00E676; }
        .area-chips-select { display: flex; flex-wrap: wrap; gap: 8px; }
        .area-chip-btn { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 14px; color: #bbb; font-size: 13px; cursor: pointer; transition: all 0.15s; }
        .area-chip-btn.selected { background: rgba(0,230,118,0.12); border-color: rgba(0,230,118,0.4); color: #00E676; }
        .drawer-submit { margin-top: 24px; width: 100%; padding: 18px; background: #00E676; color: #080808; font-weight: 700; font-size: 17px; border: none; border-radius: 100px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); transition: transform 0.15s; }
        .drawer-submit:hover { transform: scale(1.02); }
        .drawer-submit:disabled { background: rgba(0,230,118,0.3); cursor: not-allowed; }
        .drawer-error { font-size: 13px; color: #FF4444; margin-top: 10px; }
        .pending-state { text-align: center; padding: 20px 0; color: #fff; }
        .pending-timer { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 64px; color: #00E676; line-height: 1; }
        .pending-label { font-size: 14px; color: #bbb; margin-top: 8px; }
        .pending-sub { font-size: 13px; color: #ddd; margin-top: 16px; line-height: 1.6; }
        .timer-bar-track { height: 4px; background: #1f1f1f; border-radius: 100px; margin: 16px 0; overflow: hidden; }
        .timer-bar-fill { height: 100%; background: #00E676; border-radius: 100px; transition: width 1s linear; }
        .expired-state { text-align: center; padding: 20px 0; color: #fff; }
        .expired-emoji { font-size: 40px; margin-bottom: 12px; }
        .expired-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; margin-bottom: 8px; color: #fff; }
        .expired-sub { font-size: 14px; color: #bbb; }
        .close-btn { width: 100%; margin-top: 16px; padding: 14px; background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 100px; color: #ddd; font-size: 15px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .payment-row { display: flex; align-items: center; gap: 12px; background: #1f1f1f; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 16px; }
        .payment-row--cash { border-color: rgba(0,230,118,0.25); background: rgba(0,230,118,0.06); }
        .payment-row--loading { color: #888; font-size: 13px; justify-content: center; }
        .payment-row__icon { font-size: 22px; line-height: 1; }
        .payment-row__title { color: #fff; font-size: 14px; font-weight: 600; }
        .payment-row__sub { color: #888; font-size: 12px; margin-top: 2px; line-height: 1.4; }
        .payment-change-btn { background: transparent; border: 1px solid rgba(255,255,255,0.15); border-radius: 100px; padding: 6px 14px; color: #ddd; font-size: 12px; cursor: pointer; font-family: var(--font-body, 'DM Sans', sans-serif); }
        .payment-change-btn:hover { border-color: rgba(0,230,118,0.4); color: #00E676; }
      `}</style>

      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-handle" />

        {state === 'form' && (
          <>
            <div className="drawer-title">Book {driver.displayName}</div>

            <div className="drawer-label">Pickup</div>
            <input
              type="text"
              className="drawer-input"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="Where are you coming from?"
            />

            <div className="drawer-label">Drop-off</div>
            <input
              type="text"
              className="drawer-input"
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              placeholder="Where you headed?"
            />

            <div className="drawer-label">Your price ($)</div>
            <input
              type="number"
              className="drawer-input"
              value={price}
              min={driverMinimum || 1}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={driverMinimum ? `$${driverMinimum} minimum` : 'Enter amount'}
            />
            {driverMinimum > 0 && (
              <div style={{ fontSize: 12, color: Number(price) < driverMinimum ? '#FF4444' : '#888', marginTop: 6 }}>
                {Number(price) < driverMinimum
                  ? `Minimum is $${driverMinimum} — ${driver.displayName} won't see offers below this`
                  : `$${driverMinimum} minimum · you can offer more`}
              </div>
            )}

            <div className="drawer-label">Area</div>
            <div className="area-chips-select">
              {driver.areas.map((area) => (
                <button
                  key={area}
                  className={`area-chip-btn${areas.includes(area) ? ' selected' : ''}`}
                  onClick={() => toggleArea(area)}
                  type="button"
                >
                  {area}
                </button>
              ))}
            </div>

            <div className="drawer-label">When (optional)</div>
            <input
              type="text"
              className="drawer-input"
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value)}
              placeholder="e.g. Today after 3pm"
            />

            <div className="drawer-label">Payment</div>
            {isCashRide ? (
              <div className="payment-row payment-row--cash">
                <span className="payment-row__icon">💵</span>
                <div>
                  <div className="payment-row__title">Cash to driver</div>
                  <div className="payment-row__sub">Hand ${price || '?'} to {driver.displayName} at pickup.</div>
                </div>
              </div>
            ) : paymentMethods === null ? (
              <div className="payment-row payment-row--loading">Loading payment methods…</div>
            ) : hasSavedMethod && !showAddPayment ? (
              <div className="payment-row">
                <span className="payment-row__icon">💳</span>
                <div style={{ flex: 1 }}>
                  <div className="payment-row__title">
                    {defaultMethod?.brand ? defaultMethod.brand.charAt(0).toUpperCase() + defaultMethod.brand.slice(1) : 'Card'} •••• {defaultMethod?.last4 || '????'}
                  </div>
                  <div className="payment-row__sub">
                    Held when {driver.displayName} accepts. Charged when you&apos;re in the ride.
                  </div>
                </div>
                <button
                  type="button"
                  className="payment-change-btn"
                  onClick={() => setShowAddPayment(true)}
                >
                  Change
                </button>
              </div>
            ) : (
              <InlinePaymentForm
                compact
                onSuccess={() => {
                  setShowAddPayment(false);
                  fetch('/api/rider/payment-methods')
                    .then(r => r.ok ? r.json() : { methods: [] })
                    .then(data => setPaymentMethods((data.methods || []) as SavedPaymentMethod[]))
                    .catch(() => {});
                }}
                onCancel={hasSavedMethod ? () => setShowAddPayment(false) : undefined}
              />
            )}

            {error && <p className="drawer-error">{error}</p>}

            <button
              className="drawer-submit"
              onClick={handleSubmit}
              disabled={submitting || !paymentReady}
            >
              {submitting
                ? 'Sending...'
                : !paymentReady
                ? 'Link Payment to Continue'
                : `Send Booking Request — $${price || '?'}`}
            </button>
          </>
        )}

        {state === 'pending' && (
          <div className="pending-state">
            <div className="drawer-title">{driver.displayName} has {EXPIRY_MINUTES} min to respond</div>
            <div className="pending-timer">{countdownStr}</div>
            <div className="timer-bar-track">
              <div
                className="timer-bar-fill"
                style={{ width: `${(secondsLeft / (EXPIRY_MINUTES * 60)) * 100}%` }}
              />
            </div>
            <p className="pending-label">waiting on {driver.displayName}...</p>
            <p className="pending-sub">
              You&apos;ll get a notification when they respond.<br />
              No charge until they accept.
            </p>
            <button className="close-btn" onClick={onClose}>Close — I&apos;ll check back</button>
          </div>
        )}

        {state === 'expired' && (
          <div className="expired-state">
            <div className="expired-emoji">⏱</div>
            <div className="expired-title">No Response</div>
            <p className="expired-sub">
              {driver.displayName} didn&apos;t respond in time.<br />
              No charge was made. Try again tomorrow.
            </p>
            <button className="close-btn" onClick={() => { setState('form'); onClose(); }}>
              Got it
            </button>
          </div>
        )}
      </div>
    </>
  );
}
