'use client';

import { useState } from 'react';
import Link from 'next/link';
import { parseTimeShorthand } from '@/lib/utils/time-parser';
import { posthog } from '@/components/analytics/posthog-provider';

interface DriverCard {
  handle: string;
  displayName: string;
  areas: string[];
  minPrice: number;
  videoUrl: string | null;
  photoUrl: string | null;
  lgbtqFriendly: boolean;
  chillScore: number;
  isHmuFirst: boolean;
  enforceMinimum?: boolean;
  fwu?: boolean;
  acceptsCash?: boolean;
  cashOnly?: boolean;
  liveMessage: string | null;
  livePrice: number | null;
  serviceIcons?: string[];
  vehicleSummary?: { label: string; maxRiders: number | null } | null;
}

interface Props {
  drivers: DriverCard[];
}

export default function RiderBrowseClient({ drivers }: Props) {
  const [expandedHandle, setExpandedHandle] = useState<string | null>(null);
  const [filterFwu, setFilterFwu] = useState(false);
  const [filterMaxPrice, setFilterMaxPrice] = useState('');
  const [filterArea, setFilterArea] = useState('');

  // Collect all unique areas for filter
  const allAreas = Array.from(new Set(drivers.flatMap(d => d.areas))).sort();

  // Apply filters
  const filtered = drivers.filter(d => {
    if (filterFwu && !d.fwu) return false;
    if (filterMaxPrice && d.minPrice > Number(filterMaxPrice)) return false;
    if (filterArea && !d.areas.some(a => a.toLowerCase().includes(filterArea.toLowerCase()))) return false;
    return true;
  });

  return (
    <div
      style={{
        background: '#080808',
        color: '#fff',
        minHeight: '100svh',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        padding: '72px 20px 40px',
      }}
    >
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes hmuFormIn { from { max-height: 0; opacity: 0; } to { max-height: 400px; opacity: 1; } }
      `}</style>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1
          style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: '32px',
            margin: 0,
          }}
        >
          Browse Drivers
        </h1>
        <Link
          href="/rider/home"
          style={{
            fontSize: '14px',
            color: '#00E676',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Back
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        <button
          onClick={() => setFilterFwu(!filterFwu)}
          style={{
            padding: '8px 14px', borderRadius: 100, border: 'none', fontSize: 12, fontWeight: 700,
            background: filterFwu ? 'rgba(0,230,118,0.15)' : '#1a1a1a',
            color: filterFwu ? '#00E676' : '#888',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          FWU
        </button>
        <select
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
          style={{
            padding: '8px 14px', borderRadius: 100, border: 'none', fontSize: 12, fontWeight: 600,
            background: filterArea ? 'rgba(0,230,118,0.15)' : '#1a1a1a',
            color: filterArea ? '#00E676' : '#888',
            cursor: 'pointer', flexShrink: 0, appearance: 'none',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          <option value="">All Areas</option>
          {allAreas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="number"
          placeholder="Max $"
          value={filterMaxPrice}
          onChange={(e) => setFilterMaxPrice(e.target.value)}
          style={{
            width: 70, padding: '8px 12px', borderRadius: 100, border: 'none', fontSize: 12, fontWeight: 600,
            background: filterMaxPrice ? 'rgba(0,230,118,0.15)' : '#1a1a1a',
            color: filterMaxPrice ? '#00E676' : '#888',
            outline: 'none', flexShrink: 0,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        />
        {(filterFwu || filterArea || filterMaxPrice) && (
          <button
            onClick={() => { setFilterFwu(false); setFilterArea(''); setFilterMaxPrice(''); }}
            style={{
              padding: '8px 12px', borderRadius: 100, border: 'none', fontSize: 11,
              background: 'rgba(255,82,82,0.1)', color: '#FF5252', cursor: 'pointer',
              fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 && drivers.length > 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.4 }}>{'\uD83D\uDD0D'}</div>
          <div style={{ fontSize: '15px', color: '#888' }}>No drivers match your filters</div>
          <button
            onClick={() => { setFilterFwu(false); setFilterArea(''); setFilterMaxPrice(''); }}
            style={{
              marginTop: 12, padding: '10px 20px', borderRadius: 100,
              border: '1px solid rgba(0,230,118,0.2)', background: 'transparent',
              color: '#00E676', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : drivers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>{'\uD83D\uDE97'}</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
            No drivers available right now
          </div>
          <div style={{ fontSize: '14px', color: '#888', lineHeight: 1.5 }}>
            Check back soon — drivers go live throughout the day.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((driver) => (
            <div key={driver.handle}>
              <div
                style={{
                  background: '#141414',
                  border: expandedHandle === driver.handle
                    ? '1px solid rgba(0,230,118,0.3)'
                    : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '20px',
                  overflow: 'hidden',
                  transition: 'all 0.15s',
                }}
              >
                {/* Media thumbnail */}
                {(driver.photoUrl || driver.videoUrl) && (
                  <div style={{ width: '100%', height: '180px', overflow: 'hidden', position: 'relative' }}>
                    {driver.videoUrl ? (
                      <video
                        src={driver.videoUrl}
                        muted
                        playsInline
                        loop
                        autoPlay
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : driver.photoUrl ? (
                      <img
                        src={driver.photoUrl}
                        alt={driver.displayName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : null}
                  </div>
                )}

                {/* Card content */}
                <div style={{ padding: '16px 20px 20px' }}>
                  {/* Name row + badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{driver.displayName}</div>
                    {driver.isHmuFirst && (
                      <span style={{
                        display: 'inline-block', background: '#00E676', color: '#080808',
                        fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px',
                        letterSpacing: '1px', textTransform: 'uppercase',
                      }}>
                        {'\uD83E\uDD47'} HMU 1st
                      </span>
                    )}
                    {driver.fwu && (
                      <span style={{
                        display: 'inline-block', background: 'rgba(255,145,0,0.15)',
                        border: '1px solid rgba(255,145,0,0.3)', color: '#FF9100',
                        fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px',
                        letterSpacing: '1px', textTransform: 'uppercase',
                      }}>
                        FWU
                      </span>
                    )}
                    {driver.acceptsCash && (
                      <span style={{
                        display: 'inline-block', background: 'rgba(76,175,80,0.15)',
                        border: '1px solid rgba(76,175,80,0.3)', color: '#4CAF50',
                        fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px',
                        letterSpacing: '1px', textTransform: 'uppercase',
                      }}>
                        {driver.cashOnly ? 'CASH ONLY' : 'CASH OK'}
                      </span>
                    )}
                    {driver.lgbtqFriendly && (
                      <span style={{
                        display: 'inline-block', background: 'rgba(168,85,247,0.15)',
                        border: '1px solid rgba(168,85,247,0.3)', color: '#A855F7',
                        fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px',
                        letterSpacing: '1px', textTransform: 'uppercase',
                      }}>
                        LGBTQ+
                      </span>
                    )}
                    {driver.serviceIcons && driver.serviceIcons.length > 0 && (
                      <span style={{
                        display: 'inline-flex', gap: '2px', background: 'rgba(0,230,118,0.08)',
                        border: '1px solid rgba(0,230,118,0.2)', borderRadius: '100px',
                        padding: '2px 8px', fontSize: '12px', lineHeight: 1,
                      }}>
                        {driver.serviceIcons.slice(0, 5).map((icon, i) => (
                          <span key={i}>{icon}</span>
                        ))}
                      </span>
                    )}
                  </div>

                  {/* Vehicle summary */}
                  {driver.vehicleSummary && (
                    <div style={{
                      fontSize: '13px', color: '#888', marginBottom: '8px',
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      <span>🚗</span>
                      <span>{driver.vehicleSummary.label}</span>
                      {driver.vehicleSummary.maxRiders && driver.vehicleSummary.maxRiders > 0 && (
                        <span style={{
                          fontSize: '11px', color: '#555', background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '100px',
                          padding: '1px 8px',
                        }}>
                          {driver.vehicleSummary.maxRiders} riders
                        </span>
                      )}
                    </div>
                  )}

                  {/* Live availability message */}
                  {driver.liveMessage && (
                    <div style={{
                      background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.15)',
                      borderRadius: '12px', padding: '10px 14px', marginBottom: '10px',
                      display: 'flex', alignItems: 'flex-start', gap: '8px',
                    }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: 'rgba(0,230,118,0.15)', borderRadius: '100px', padding: '2px 8px',
                        fontSize: '10px', fontWeight: 700, color: '#00E676',
                        letterSpacing: '1px', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: '#00E676', display: 'inline-block',
                          animation: 'pulse 1.5s ease-in-out infinite',
                        }} />
                        LIVE
                      </span>
                      <span style={{ fontSize: '14px', color: '#fff', lineHeight: 1.3 }}>
                        {driver.liveMessage}
                      </span>
                    </div>
                  )}

                  {/* Trust badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#00E676' }}>{'\u2713'}</span>
                    <span style={{ fontSize: '11px', color: '#888', fontWeight: 600, letterSpacing: '0.5px' }}>
                      Identity Verified + Video Confirmed
                    </span>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{
                        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                        fontSize: '20px', color: '#00E676',
                      }}>
                        {driver.chillScore.toFixed(0)}%
                      </span>
                      <span style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Chill
                      </span>
                    </div>
                    {driver.minPrice > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{
                          fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                          fontSize: '20px', color: '#fff', lineHeight: 1,
                        }}>
                          ${driver.minPrice}+
                        </span>
                        <span style={{ fontSize: '9px', color: '#888', letterSpacing: '0.5px' }}>
                          starts at
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Areas */}
                  {driver.areas.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      {driver.areas.slice(0, 4).map((area) => (
                        <span key={area} style={{
                          background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px', padding: '4px 10px', fontSize: '11px', color: '#bbb',
                        }}>
                          {area}
                        </span>
                      ))}
                      {driver.areas.length > 4 && (
                        <span style={{
                          background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px', padding: '4px 10px', fontSize: '11px', color: '#888',
                        }}>
                          +{driver.areas.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        if (expandedHandle !== driver.handle) posthog.capture('browse_hmu_clicked', { driverHandle: driver.handle });
                        setExpandedHandle(expandedHandle === driver.handle ? null : driver.handle);
                      }}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '100px', border: 'none',
                        background: '#00E676', color: '#080808', fontWeight: 700, fontSize: '15px',
                        cursor: 'pointer', fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                        transition: 'all 0.15s',
                      }}
                    >
                      {expandedHandle === driver.handle ? 'Close' : 'HMU'}
                    </button>
                    <Link
                      href={`/d/${driver.handle}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '12px 16px', borderRadius: '100px',
                        border: '1px solid rgba(255,255,255,0.15)', color: '#bbb',
                        fontSize: '13px', fontWeight: 600, textDecoration: 'none',
                        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
                      }}
                    >
                      Profile
                    </Link>
                  </div>
                </div>

                {/* Inline HMU form */}
                {expandedHandle === driver.handle && (
                  <InlineBookingForm
                    handle={driver.handle}
                    displayName={driver.displayName}
                    minPrice={driver.minPrice}
                    enforceMinimum={driver.enforceMinimum !== false}
                    fwu={driver.fwu || false}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineBookingForm({
  handle,
  displayName,
  minPrice,
  enforceMinimum,
  fwu,
}: {
  handle: string;
  displayName: string;
  minPrice: number;
  enforceMinimum: boolean;
  fwu: boolean;
}) {
  // Default amount: driver's minimum, or $15 if FWU or no minimum set
  const defaultAmount = (minPrice > 0 && !fwu) ? String(minPrice) : '15';
  const [destination, setDestination] = useState('');
  const [time, setTime] = useState('');
  const [amount, setAmount] = useState(defaultAmount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const parsedAmount = parseFloat(amount) || 0;
  const belowMin = enforceMinimum && minPrice > 0 && parsedAmount > 0 && parsedAmount < minPrice;
  const parsedTime = parseTimeShorthand(time);

  async function handleSubmit() {
    if (!destination.trim()) { setError('Where you going?'); return; }
    if (parsedAmount < 1) { setError('Minimum $1'); return; }
    if (belowMin) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/drivers/${handle}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: parsedAmount,
          timeWindow: {
            destination: destination.trim(),
            time: parsedTime.display,
            message: `${destination.trim()} $${parsedAmount} ${parsedTime.display}`,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        posthog.capture('direct_booking_sent', { driverHandle: handle, price: parsedAmount, destination: destination.trim() });
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to send');
      }
    } catch {
      setError('Network error');
    }
    setSubmitting(false);
  }

  if (success) {
    return (
      <div style={{
        padding: '20px', borderTop: '1px solid rgba(255,255,255,0.08)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>{'\u2705'}</div>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#00E676' }}>
          Sent to {displayName}!
        </div>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
          They have 30 min to accept. You&apos;ll get a notification.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '16px 20px 20px',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      animation: 'hmuFormIn 0.25s ease-out',
      overflow: 'hidden',
    }}>
      <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
        Book {displayName} directly
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Destination */}
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Where you headed? (e.g. midtown > airport)"
          style={{
            background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px', padding: '12px 14px', color: '#fff',
            fontSize: '14px', outline: 'none', width: '100%',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        />

        {/* Time + Amount row */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="When? (asap, 2pm, 2mor)"
            style={{
              flex: 1, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px', padding: '12px 14px', color: '#fff',
              fontSize: '14px', outline: 'none',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          />
          <div style={{ position: 'relative', width: '100px' }}>
            <span style={{
              position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
              color: '#00E676', fontSize: '16px', fontWeight: 700, pointerEvents: 'none',
            }}>$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              style={{
                width: '100%', background: '#1a1a1a',
                border: belowMin ? '1px solid #FF5252' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px', padding: '12px 14px 12px 28px', color: '#fff',
                fontSize: '14px', outline: 'none',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            />
          </div>
        </div>

        {/* Below minimum warning */}
        {belowMin && (
          <div style={{
            fontSize: '12px', color: '#FF5252', padding: '6px 10px',
            background: 'rgba(255,82,82,0.08)', borderRadius: '8px',
          }}>
            this driver says dont hmu for less than ${minPrice}
          </div>
        )}

        {/* Parsed time display */}
        {time && parsedTime.display !== time && (
          <div style={{ fontSize: '11px', color: '#888' }}>
            {parsedTime.display}
          </div>
        )}

        {error && (
          <div style={{ fontSize: '12px', color: '#FF5252' }}>{error}</div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || belowMin}
          style={{
            width: '100%', padding: '14px', borderRadius: '100px', border: 'none',
            background: belowMin ? '#333' : '#00E676',
            color: belowMin ? '#888' : '#080808',
            fontWeight: 700, fontSize: '15px',
            cursor: submitting || belowMin ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.5 : 1,
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            transition: 'all 0.15s',
          }}
        >
          {submitting ? 'Sending...' : `Send to ${displayName}`}
        </button>
      </div>
    </div>
  );
}
