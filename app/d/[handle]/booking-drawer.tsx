'use client';

import { useEffect, useRef, useState } from 'react';

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
  prefill?: { price?: string; pickup?: string; dropoff?: string; time?: string; stops?: string; roundTrip?: boolean; isCash?: boolean } | null;
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

  const handleSubmit = async () => {
    if (!price || !dropoff) {
      setError('Set a price and drop-off location.');
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
            stops: prefill?.stops || '',
            round_trip: prefill?.roundTrip || false,
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
              min={1}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Enter amount"
            />

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

            {error && <p className="drawer-error">{error}</p>}

            <button
              className="drawer-submit"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Sending...' : `Send Booking Request — $${price || '?'}`}
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
