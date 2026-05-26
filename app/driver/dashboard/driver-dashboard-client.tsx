'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAbly } from '@/hooks/use-ably';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface Booking {
  bookingId: string;
  bookingType: string;
  startAt: string;
  endAt: string;
  bookingStatus: string;
  title: string | null;
  isNew: boolean;
  ride: {
    id: string;
    status: string;
    price: number;
    addOns: number;
    isCash: boolean;
    pickup: string | null;
    dropoff: string | null;
    payout: number;
    createdAt: string;
  } | null;
  rider: {
    handle: string;
    name: string;
    avatar: string | null;
    video: string | null;
    chillScore: number;
    completedRides: number;
  } | null;
}

interface DashboardData {
  view: string;
  bookings: Booking[];
  vehicleMpg: number | null;
  summary: { total: number; today: number; rides: number; blocked: number; newSinceLastView: number };
}

const COLORS = { green: '#00E676', black: '#080808', card: '#141414', white: '#fff', gray: '#888', grayLight: '#bbb', red: '#FF5252', orange: '#FF9100', blue: '#448AFF', yellow: '#FFC107' };
const FONTS = { display: "var(--font-display, 'Bebas Neue', sans-serif)", body: "var(--font-body, 'DM Sans', sans-serif)", mono: "var(--font-mono, 'Space Mono', monospace)" };

export default function DriverDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [view, setView] = useState<'today' | 'week'>('today');
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [smsText, setSmsText] = useState('');
  const [sendingSms, setSendingSms] = useState<string | null>(null);
  const [gasPrice, setGasPrice] = useState('');
  const [gasOpen, setGasOpen] = useState(false);
  const [gasFocused, setGasFocused] = useState(false);
  const prevGasResult = useRef<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/driver/dashboard?view=${view}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, [view]);

  useEffect(() => { setLoading(true); fetchDashboard(); }, [fetchDashboard]);

  // Real-time updates
  useAbly({
    channelName: 'admin:feed',
    onMessage: useCallback((msg: { name: string }) => {
      if (['ride_created', 'ride_status_change', 'booking_accepted'].includes(msg.name)) fetchDashboard();
    }, [fetchDashboard]),
  });

  const sendSmsToRider = async (rideId: string, riderHandle: string) => {
    if (!smsText.trim()) return;
    setSendingSms(rideId);
    try {
      await fetch(`/api/rides/${rideId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: smsText, type: 'quick_message' }),
      });
      setSmsText('');
    } catch { /* silent */ }
    setSendingSms(null);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    let hr = d.getHours();
    const ampm = hr >= 12 ? 'PM' : 'AM';
    hr = hr % 12 || 12;
    const min = d.getMinutes();
    return `${hr}${min > 0 ? ':' + String(min).padStart(2, '0') : ''}${ampm}`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div style={{ background: COLORS.black, minHeight: '100svh', color: COLORS.white, fontFamily: FONTS.body, paddingTop: 56, paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/driver/home" style={{ color: COLORS.green, display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
          <ChevronLeft size={16} /> Home
        </Link>
      </div>

      <div style={{ padding: '12px 20px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: FONTS.display, fontSize: 32, lineHeight: 1 }}>Dashboard</div>
          {data?.summary.newSinceLastView ? (
            <div style={{ fontSize: 12, color: COLORS.green, marginTop: 4, fontWeight: 600 }}>
              {data.summary.newSinceLastView} new since last visit
            </div>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.gray, marginTop: 4 }}>Your rides at a glance</div>
          )}
        </div>
        <Link href="/driver/schedule" style={{ fontSize: 12, color: COLORS.green, textDecoration: 'none', fontWeight: 600 }}>
          Calendar →
        </Link>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 20px 16px' }}>
        {(['today', 'week'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: '10px', borderRadius: 100, fontSize: 13, fontWeight: 600,
            background: view === v ? 'rgba(0,230,118,0.12)' : 'transparent',
            color: view === v ? COLORS.green : COLORS.gray,
            border: `1px solid ${view === v ? 'rgba(0,230,118,0.3)' : 'rgba(255,255,255,0.08)'}`,
            cursor: 'pointer', fontFamily: FONTS.body,
          }}>
            {v === 'today' ? 'Today' : 'This Week'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {data && (
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px' }}>
          <div style={{ flex: 1, background: COLORS.card, borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONTS.mono }}>Rides</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FONTS.display }}>{data.summary.rides}</div>
          </div>
          <div style={{ flex: 1, background: COLORS.card, borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONTS.mono }}>Blocked</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FONTS.display }}>{data.summary.blocked}</div>
          </div>
          <div style={{ flex: 1, background: COLORS.card, borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: COLORS.gray, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONTS.mono }}>Total</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FONTS.display }}>{data.summary.total}</div>
          </div>
        </div>
      )}

      {/* Gas cost calculator */}
      <style>{`
        @keyframes gasResultIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes gasPanelFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .gas-btn:active { transform: scale(0.985); }
      `}</style>
      <div style={{ padding: '0 20px 16px' }}>
        <button
          className="gas-btn"
          onClick={() => setGasOpen(o => !o)}
          style={{
            width: '100%', background: COLORS.card,
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: gasOpen ? '12px 12px 0 0' : 12,
            padding: '12px 16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: COLORS.white, fontFamily: FONTS.body,
            transition: 'border-radius 0.25s ease, background 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⛽</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Gas Check</div>
              <div style={{ fontSize: 11, color: COLORS.gray }}>
                {data?.vehicleMpg
                  ? `${data.vehicleMpg} MPG · see your cost per mile`
                  : 'Set your MPG in profile to calculate'}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: 12, color: COLORS.gray,
            display: 'inline-block',
            transform: gasOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s ease',
          }}>▼</span>
        </button>

        {/* Animated panel — always in DOM, toggled via max-height + opacity */}
        <div style={{
          overflow: 'hidden',
          maxHeight: gasOpen ? 320 : 0,
          opacity: gasOpen ? 1 : 0,
          transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
        }}>
          <div style={{
            background: COLORS.card, border: '1px solid rgba(255,255,255,0.06)',
            borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '16px',
            animation: gasOpen ? 'gasPanelFadeIn 0.25s ease' : 'none',
          }}>
            {!data?.vehicleMpg ? (
              <div style={{ fontSize: 13, color: COLORS.gray, textAlign: 'center', paddingBottom: 4 }}>
                Add your MPG in{' '}
                <a href="/driver/profile" style={{ color: COLORS.green, textDecoration: 'none', fontWeight: 600 }}>
                  Profile → Vehicle Info
                </a>{' '}
                to use this calculator.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: COLORS.gray, marginBottom: 8 }}>What did you pay per gallon?</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{
                      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                      color: gasFocused ? COLORS.green : COLORS.gray,
                      fontSize: 16, fontFamily: FONTS.mono, pointerEvents: 'none',
                      transition: 'color 0.15s ease',
                    }}>$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={gasPrice}
                      onChange={e => setGasPrice(e.target.value)}
                      onFocus={() => setGasFocused(true)}
                      onBlur={() => setGasFocused(false)}
                      placeholder="3.45"
                      style={{
                        width: '100%', background: '#1a1a1a',
                        border: `1px solid ${gasFocused ? 'rgba(0,230,118,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        boxShadow: gasFocused ? '0 0 0 3px rgba(0,230,118,0.08)' : 'none',
                        borderRadius: 10, padding: '10px 14px 10px 28px', color: COLORS.white,
                        fontSize: 18, fontFamily: FONTS.mono, outline: 'none', boxSizing: 'border-box',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.gray, flexShrink: 0 }}>/ gal</div>
                </div>

                {gasPrice && Number(gasPrice) > 0 && (() => {
                  const costPerMile = Number(gasPrice) / data.vehicleMpg!;
                  const suggestedMin = Math.ceil(costPerMile * 100) / 100;
                  const resultKey = `${gasPrice}-${data.vehicleMpg}`;
                  const isNew = prevGasResult.current !== resultKey;
                  prevGasResult.current = resultKey;
                  return (
                    <div
                      key={resultKey}
                      style={{
                        display: 'flex', gap: 8,
                        animation: isNew ? 'gasResultIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both' : 'none',
                      }}
                    >
                      <div style={{
                        flex: 1, background: '#1a1a1a', borderRadius: 10, padding: '10px 12px',
                        transition: 'transform 0.15s ease',
                      }}>
                        <div style={{ fontSize: 10, color: COLORS.gray, fontFamily: FONTS.mono, marginBottom: 4 }}>GAS COST / MILE</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.orange, fontFamily: FONTS.display }}>
                          ${costPerMile.toFixed(2)}
                        </div>
                      </div>
                      <div style={{
                        flex: 1, background: '#1a1a1a', borderRadius: 10, padding: '10px 12px',
                        transition: 'transform 0.15s ease',
                      }}>
                        <div style={{ fontSize: 10, color: COLORS.gray, fontFamily: FONTS.mono, marginBottom: 4 }}>MIN CHARGE / MILE</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.green, fontFamily: FONTS.display }}>
                          ${suggestedMin.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ fontSize: 11, color: COLORS.gray, marginTop: 12, textAlign: 'center' }}>
                  Based on your {data.vehicleMpg} MPG ·{' '}
                  <a href="/driver/profile#vehicle" style={{ color: COLORS.green, textDecoration: 'none' }}>update MPG</a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bookings list */}
      <div style={{ padding: '0 20px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: COLORS.gray }}>Loading...</div>}

        {!loading && data?.bookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 8, opacity: 0.3 }}>📅</div>
            <div style={{ fontSize: 16, color: COLORS.gray }}>No bookings {view === 'today' ? 'today' : 'this week'}</div>
            <div style={{ fontSize: 13, color: COLORS.gray, marginTop: 4 }}>Share your link to get riders booking</div>
          </div>
        )}

        {data?.bookings.map(booking => {
          const isExpanded = expandedId === booking.bookingId;
          const isRide = booking.bookingType === 'ride' && booking.ride;
          const statusColor = booking.ride?.status === 'completed' ? COLORS.green
            : booking.ride?.status === 'active' ? COLORS.green
            : booking.ride?.status === 'matched' ? COLORS.blue
            : booking.ride?.status === 'cancelled' ? COLORS.red
            : COLORS.gray;

          return (
            <div key={booking.bookingId} style={{
              background: COLORS.card, borderRadius: 16, marginBottom: 10,
              border: booking.isNew ? '1px solid rgba(0,230,118,0.3)' : '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              {/* New badge */}
              {booking.isNew && (
                <div style={{ background: 'rgba(0,230,118,0.12)', padding: '3px 0', textAlign: 'center', fontSize: 10, fontWeight: 700, color: COLORS.green, letterSpacing: 1, textTransform: 'uppercase' }}>
                  NEW
                </div>
              )}

              {/* Main row */}
              <button onClick={() => setExpandedId(isExpanded ? null : booking.bookingId)} style={{
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left',
              }}>
                {/* Time */}
                <div style={{ flexShrink: 0, textAlign: 'center', width: 50 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white, fontFamily: FONTS.mono }}>{formatTime(booking.startAt)}</div>
                  {view === 'week' && <div style={{ fontSize: 10, color: COLORS.gray }}>{formatDate(booking.startAt)}</div>}
                </div>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isRide ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.white }}>
                          {booking.rider?.handle ? `@${booking.rider.handle}` : booking.rider?.name || 'Rider'}
                        </span>
                        {booking.ride?.isCash && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: COLORS.yellow, background: 'rgba(255,193,7,0.15)', padding: '1px 6px', borderRadius: 100 }}>CASH</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.grayLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {booking.ride?.pickup || '?'} → {booking.ride?.dropoff || '?'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.red }}>{booking.title || 'Blocked'}</div>
                  )}
                </div>

                {/* Price + Status */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  {isRide && (
                    <>
                      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, fontFamily: FONTS.mono }}>${booking.ride!.price}</div>
                      <div style={{ fontSize: 10, color: statusColor, fontWeight: 600, textTransform: 'uppercase' }}>{booking.ride!.status}</div>
                    </>
                  )}
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && isRide && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  {/* Rider profile */}
                  {booking.rider && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, overflow: 'hidden', background: '#1a1a1a', flexShrink: 0,
                      }}>
                        {booking.rider.avatar ? (
                          <img src={booking.rider.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#444' }}>
                            {(booking.rider.name || 'R').charAt(0)}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.white }}>{booking.rider.name}</div>
                        <div style={{ fontSize: 11, color: COLORS.gray }}>
                          {booking.rider.chillScore > 0 && <span style={{ color: COLORS.green }}>{booking.rider.chillScore}% Chill</span>}
                          {booking.rider.completedRides > 0 && <span> · {booking.rider.completedRides} rides</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Route */}
                  <div style={{ padding: '10px 0', fontSize: 13 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <span style={{ color: COLORS.green, fontWeight: 700, fontSize: 11 }}>FROM</span>
                      <span style={{ color: COLORS.grayLight }}>{booking.ride!.pickup || 'Not set'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ color: COLORS.red, fontWeight: 700, fontSize: 11 }}>TO</span>
                      <span style={{ color: COLORS.grayLight }}>{booking.ride!.dropoff || 'Not set'}</span>
                    </div>
                  </div>

                  {/* Payment */}
                  <div style={{ display: 'flex', gap: 8, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: COLORS.gray, fontFamily: FONTS.mono }}>PRICE</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white, fontFamily: FONTS.mono }}>${booking.ride!.price}</div>
                    </div>
                    {booking.ride!.addOns > 0 && (
                      <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: COLORS.gray, fontFamily: FONTS.mono }}>ADD-ONS</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.green, fontFamily: FONTS.mono }}>${booking.ride!.addOns}</div>
                      </div>
                    )}
                    <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: COLORS.gray, fontFamily: FONTS.mono }}>{booking.ride!.isCash ? 'CASH' : 'PAYOUT'}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: booking.ride!.isCash ? COLORS.yellow : COLORS.green, fontFamily: FONTS.mono }}>
                        ${booking.ride!.isCash ? booking.ride!.price + booking.ride!.addOns : booking.ride!.payout}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 10 }}>
                    <Link href={`/ride/${booking.ride!.id}`} style={{
                      flex: 1, padding: 10, borderRadius: 100, textAlign: 'center',
                      background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.2)',
                      color: COLORS.green, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    }}>
                      View Ride
                    </Link>
                  </div>

                  {/* Quick SMS */}
                  {booking.ride!.status === 'matched' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        type="text" value={smsText}
                        onChange={e => setSmsText(e.target.value)}
                        placeholder="Message rider..."
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 100,
                          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                          color: COLORS.white, fontSize: 13, outline: 'none',
                        }}
                      />
                      <button onClick={() => sendSmsToRider(booking.ride!.id, booking.rider?.handle || '')}
                        disabled={!smsText.trim() || sendingSms === booking.ride!.id}
                        style={{
                          padding: '8px 16px', borderRadius: 100, border: 'none',
                          background: smsText.trim() ? COLORS.blue : 'rgba(255,255,255,0.06)',
                          color: smsText.trim() ? COLORS.white : COLORS.gray,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                        Send
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
