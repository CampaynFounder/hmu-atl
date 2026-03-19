'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useAbly } from '@/hooks/use-ably';
import Link from 'next/link';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// ── Theme constants (inline, no CSS vars) ──
const COLORS = {
  green: '#00E676',
  black: '#080808',
  card: '#141414',
  white: '#FFFFFF',
  gray: '#888888',
  grayLight: '#AAAAAA',
  red: '#FF5252',
  blue: '#448AFF',
  yellow: '#FFD740',
  orange: '#FF9100',
};

const FONTS = {
  display: "'Bebas Neue', sans-serif",
  body: "'DM Sans', sans-serif",
  mono: "'Space Mono', monospace",
};

// ── Types ──
interface RideData {
  status: string;
  driverName: string;
  riderName: string;
  agreedPrice: number;
  agreementSummary: Record<string, unknown> | null;
  pickup: Record<string, unknown> | null;
  dropoff: Record<string, unknown> | null;
  stops: unknown[] | null;
  otwAt: string | null;
  hereAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  disputeWindowExpiresAt: string | null;
  driverPayoutAmount: number;
  platformFeeAmount: number;
}

interface ActiveRideClientProps {
  rideId: string;
  userId: string;
  isDriver: boolean;
  initialRide: RideData;
  mapboxToken: string;
}

type RatingType = 'chill' | 'cool_af' | 'kinda_creepy' | 'weirdo';

const RATING_OPTIONS: { type: RatingType; label: string; emoji: string; description: string; color: string }[] = [
  { type: 'chill', label: 'CHILL', emoji: '\u2705', description: 'Good vibes', color: COLORS.green },
  { type: 'cool_af', label: 'Cool AF', emoji: '\uD83D\uDE0E', description: 'Great energy', color: COLORS.blue },
  { type: 'kinda_creepy', label: 'Kinda Creepy', emoji: '\uD83D\uDC40', description: 'Something felt off', color: COLORS.yellow },
  { type: 'weirdo', label: 'WEIRDO', emoji: '\uD83D\uDEA9', description: 'Safety concern', color: COLORS.red },
];

// ── Status display config ──
function getStatusDisplay(status: string, isDriver: boolean): { label: string; color: string } {
  switch (status) {
    case 'matched':
      return isDriver
        ? { label: 'MATCHED', color: COLORS.green }
        : { label: 'MATCHED', color: COLORS.green };
    case 'otw':
      return { label: 'OTW', color: COLORS.orange };
    case 'here':
      return { label: 'HERE', color: COLORS.yellow };
    case 'active':
      return { label: 'RIDE ACTIVE', color: COLORS.green };
    case 'ended':
      return { label: 'RIDE ENDED', color: COLORS.grayLight };
    case 'completed':
      return { label: 'COMPLETED', color: COLORS.green };
    case 'disputed':
      return { label: 'DISPUTED', color: COLORS.red };
    case 'cancelled':
      return { label: 'CANCELLED', color: COLORS.red };
    default:
      return { label: status.toUpperCase(), color: COLORS.gray };
  }
}

export default function ActiveRideClient({
  rideId,
  userId,
  isDriver,
  initialRide,
  mapboxToken,
}: ActiveRideClientProps) {
  const [ride, setRide] = useState<RideData>(initialRide);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rated, setRated] = useState(false);
  const [disputeWindowRemaining, setDisputeWindowRemaining] = useState<number | null>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const riderMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // GPS tracking for driver during active ride phases
  const shouldTrackGps = isDriver && ['otw', 'here', 'active'].includes(ride.status);
  const geo = useGeolocation({ rideId, enabled: shouldTrackGps });

  // Ably real-time subscription
  const handleAblyMessage = useCallback((msg: { name: string; data: unknown }) => {
    const data = msg.data as Record<string, unknown>;

    switch (msg.name) {
      case 'status_update': {
        const newStatus = data.status as string;
        setRide(prev => ({ ...prev, status: newStatus }));
        showNotification(getStatusNotification(newStatus, isDriver));
        break;
      }
      case 'location_update': {
        const lat = data.lat as number;
        const lng = data.lng as number;
        setDriverLocation({ lat, lng });
        break;
      }
      case 'ride_ended': {
        setRide(prev => ({
          ...prev,
          status: 'ended',
          endedAt: data.ended_at as string,
          disputeWindowExpiresAt: data.dispute_window_expires_at as string,
          driverPayoutAmount: Number(data.driver_payout_amount || prev.driverPayoutAmount),
          platformFeeAmount: Number(data.platform_fee_amount || prev.platformFeeAmount),
        }));
        showNotification('Ride ended');
        break;
      }
      case 'dispute_filed': {
        setRide(prev => ({ ...prev, status: 'disputed' }));
        showNotification('A dispute has been filed');
        break;
      }
      default:
        break;
    }
  }, [isDriver]);

  useAbly({
    channelName: `ride:${rideId}`,
    rideId,
    onMessage: handleAblyMessage,
  });

  // Update driver marker on GPS change
  useEffect(() => {
    if (isDriver && geo.lat && geo.lng) {
      setDriverLocation({ lat: geo.lat, lng: geo.lng });
    }
  }, [isDriver, geo.lat, geo.lng]);

  // ── Map initialization ──
  useEffect(() => {
    if (!mapContainerRef.current || !mapboxToken || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;

    const center: [number, number] = driverLocation
      ? [driverLocation.lng, driverLocation.lat]
      : [-84.388, 33.749]; // Atlanta default

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom: 14,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update driver marker ──
  useEffect(() => {
    if (!mapRef.current || !driverLocation) return;

    if (!driverMarkerRef.current) {
      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = COLORS.green;
      el.style.border = '3px solid ' + COLORS.white;
      el.style.boxShadow = '0 0 12px ' + COLORS.green;

      driverMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([driverLocation.lng, driverLocation.lat])
        .addTo(mapRef.current);
    } else {
      driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
    }

    // Fly to driver location if actively tracking
    if (shouldTrackGps || !isDriver) {
      mapRef.current.easeTo({
        center: [driverLocation.lng, driverLocation.lat],
        duration: 1000,
      });
    }
  }, [driverLocation, shouldTrackGps, isDriver]);

  // ── Pickup/dropoff markers ──
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Add pickup marker
    if (ride.pickup) {
      const lat = Number((ride.pickup as Record<string, unknown>).lat || (ride.pickup as Record<string, unknown>).latitude);
      const lng = Number((ride.pickup as Record<string, unknown>).lng || (ride.pickup as Record<string, unknown>).longitude);
      if (lat && lng && !riderMarkerRef.current) {
        const el = document.createElement('div');
        el.style.width = '14px';
        el.style.height = '14px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = COLORS.blue;
        el.style.border = '2px solid ' + COLORS.white;
        el.style.boxShadow = '0 0 8px ' + COLORS.blue;

        riderMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
      }
    }
  }, [ride.pickup]);

  // ── Dispute window countdown ──
  useEffect(() => {
    if (ride.status !== 'ended' || !ride.disputeWindowExpiresAt) return;

    const updateCountdown = () => {
      const remaining = new Date(ride.disputeWindowExpiresAt!).getTime() - Date.now();
      setDisputeWindowRemaining(Math.max(0, remaining));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [ride.status, ride.disputeWindowExpiresAt]);

  // ── Notification auto-dismiss ──
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  function showNotification(msg: string) {
    if (msg) setNotification(msg);
  }

  // ── API actions ──
  async function callAction(endpoint: string, method = 'POST') {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/${rideId}/${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error || 'Something went wrong');
      }
      const data = await res.json();
      // Update local state from response
      if (data.status) {
        setRide(prev => ({ ...prev, status: data.status }));
      }
      if (data.driver_payout_amount !== undefined) {
        setRide(prev => ({
          ...prev,
          driverPayoutAmount: Number(data.driver_payout_amount),
          platformFeeAmount: Number(data.platform_fee_amount || prev.platformFeeAmount),
        }));
      }
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRate(ratingType: RatingType) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rides/${rideId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating_type: ratingType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error || 'Failed to submit rating');
      }
      setRated(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to rate';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDispute() {
    await callAction('dispute');
  }

  // ── Derived values ──
  const statusDisplay = getStatusDisplay(ride.status, isDriver);
  const otherName = isDriver ? ride.riderName : ride.driverName;
  const disputeMinutes = disputeWindowRemaining !== null
    ? Math.ceil(disputeWindowRemaining / 60000)
    : null;

  const pickupAddress = ride.pickup
    ? ((ride.pickup as Record<string, unknown>).address as string) ||
      ((ride.pickup as Record<string, unknown>).name as string) ||
      'Pickup location'
    : null;

  const dropoffAddress = ride.dropoff
    ? ((ride.dropoff as Record<string, unknown>).address as string) ||
      ((ride.dropoff as Record<string, unknown>).name as string) ||
      'Dropoff location'
    : null;

  const stopCount = ride.stops ? ride.stops.length : 0;

  // ── Render ──
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: COLORS.black,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: FONTS.body,
      color: COLORS.white,
    }}>
      {/* Notification toast */}
      {notification && (
        <div style={{
          position: 'absolute',
          top: 16,
          left: 16,
          right: 16,
          zIndex: 50,
          backgroundColor: COLORS.card,
          border: '1px solid ' + COLORS.green,
          borderRadius: 12,
          padding: '12px 16px',
          fontFamily: FONTS.body,
          fontSize: 14,
          color: COLORS.white,
          textAlign: 'center',
        }}>
          {notification}
        </div>
      )}

      {/* Map section — top 60% */}
      <div style={{ flex: '0 0 60%', position: 'relative' }}>
        <div
          ref={mapContainerRef}
          id="ride-map"
          style={{ width: '100%', height: '100%' }}
        />

        {/* GPS error overlay */}
        {shouldTrackGps && geo.error && (
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            backgroundColor: 'rgba(255, 82, 82, 0.9)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: FONTS.body,
            color: COLORS.white,
            textAlign: 'center',
          }}>
            GPS: {geo.error}
          </div>
        )}

        {/* Connection status */}
        {!isDriver && ride.status === 'otw' && !driverLocation && (
          <div style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            backgroundColor: 'rgba(136, 136, 136, 0.9)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            fontFamily: FONTS.body,
            color: COLORS.white,
            textAlign: 'center',
          }}>
            Waiting for driver location...
          </div>
        )}
      </div>

      {/* Status + Actions section — bottom 40% */}
      <div style={{
        flex: '0 0 40%',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 20px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        overflowY: 'auto',
        backgroundColor: COLORS.black,
      }}>
        {/* Status header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div>
            <div style={{
              fontFamily: FONTS.display,
              fontSize: 32,
              letterSpacing: 2,
              color: statusDisplay.color,
              lineHeight: 1,
            }}>
              {statusDisplay.label}
            </div>
            <div style={{
              fontSize: 14,
              color: COLORS.grayLight,
              marginTop: 2,
            }}>
              {isDriver ? `Rider: ${otherName}` : `Driver: ${otherName}`}
            </div>
          </div>
          <div style={{
            fontFamily: FONTS.mono,
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.green,
          }}>
            ${ride.agreedPrice.toFixed(2)}
          </div>
        </div>

        {/* Agreement summary */}
        {(pickupAddress || dropoffAddress) && (
          <div style={{
            backgroundColor: COLORS.card,
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 12,
            fontSize: 13,
            color: COLORS.grayLight,
          }}>
            {pickupAddress && (
              <div style={{ marginBottom: dropoffAddress ? 6 : 0 }}>
                <span style={{ color: COLORS.green, marginRight: 8 }}>FROM</span>
                {pickupAddress}
              </div>
            )}
            {dropoffAddress && (
              <div>
                <span style={{ color: COLORS.red, marginRight: 8 }}>TO</span>
                {dropoffAddress}
              </div>
            )}
            {stopCount > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: COLORS.gray }}>
                + {stopCount} stop{stopCount > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(255, 82, 82, 0.15)',
            border: '1px solid ' + COLORS.red,
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            color: COLORS.red,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Dynamic content based on status and role */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          {renderStatusContent()}
        </div>
      </div>
    </div>
  );

  // ── Status-specific content renderer ──
  function renderStatusContent() {
    // ── DRIVER views ──
    if (isDriver) {
      switch (ride.status) {
        case 'matched':
          return (
            <ActionButton
              label="OTW"
              color={COLORS.green}
              onPress={() => callAction('otw')}
              loading={loading}
            />
          );

        case 'otw':
          return (
            <>
              <StatusMessage text="Heading to rider..." />
              <ActionButton
                label="I'M HERE"
                color={COLORS.green}
                onPress={() => callAction('here')}
                loading={loading}
              />
            </>
          );

        case 'here':
          return (
            <StatusMessage text="Waiting for rider to get in..." />
          );

        case 'active':
          return (
            <ActionButton
              label="END RIDE"
              color={COLORS.red}
              onPress={() => callAction('end')}
              loading={loading}
            />
          );

        case 'ended':
        case 'completed':
          return renderDriverPayout();

        case 'disputed':
          return (
            <StatusMessage text="This ride is under review. We'll notify you when it's resolved." />
          );

        case 'cancelled':
          return renderBackHome('Ride was cancelled');

        default:
          return <StatusMessage text={`Status: ${ride.status}`} />;
      }
    }

    // ── RIDER views ──
    switch (ride.status) {
      case 'matched':
        return (
          <StatusMessage text="Waiting for driver to start heading your way..." />
        );

      case 'otw':
        return (
          <StatusMessage text="Driver is on the way" />
        );

      case 'here':
        return (
          <>
            <StatusMessage text="Your driver is here!" />
            <ActionButton
              label="BET"
              subtitle="heading to car"
              color={COLORS.green}
              onPress={() => callAction('start')}
              loading={loading}
            />
          </>
        );

      case 'active':
        return (
          <StatusMessage text="Ride in progress" />
        );

      case 'ended':
        return renderRiderPostRide();

      case 'completed':
        return renderBackHome('Ride complete');

      case 'disputed':
        return (
          <StatusMessage text="Your dispute is being reviewed. We'll be in touch." />
        );

      case 'cancelled':
        return renderBackHome('Ride was cancelled');

      default:
        return <StatusMessage text={`Status: ${ride.status}`} />;
    }
  }

  // ── Driver payout summary ──
  function renderDriverPayout() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          backgroundColor: COLORS.card,
          borderRadius: 16,
          padding: '20px 16px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: COLORS.grayLight, marginBottom: 4 }}>
            You earned
          </div>
          <div style={{
            fontFamily: FONTS.mono,
            fontSize: 42,
            fontWeight: 700,
            color: COLORS.green,
            lineHeight: 1.1,
          }}>
            ${ride.driverPayoutAmount.toFixed(2)}
          </div>
          <div style={{
            fontSize: 13,
            color: COLORS.gray,
            marginTop: 8,
            fontFamily: FONTS.mono,
          }}>
            HMU took: ${ride.platformFeeAmount.toFixed(2)}
          </div>
          {ride.platformFeeAmount === 0 && ride.driverPayoutAmount > 0 && (
            <div style={{
              marginTop: 8,
              fontSize: 14,
              color: COLORS.green,
              fontWeight: 600,
            }}>
              Daily cap hit — rest of today is ALL yours
            </div>
          )}
        </div>

        <div style={{
          fontSize: 13,
          color: COLORS.gray,
          textAlign: 'center',
        }}>
          Cash out from your home screen
        </div>

        {!rated && renderRatingCards()}

        {rated && renderBackHome('Thanks! Ride complete.')}
      </div>
    );
  }

  // ── Rider post-ride: rating + dispute ──
  function renderRiderPostRide() {
    if (rated) {
      return renderBackHome('Thanks! Ride complete.');
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Dispute countdown */}
        {disputeMinutes !== null && disputeMinutes > 0 && (
          <div style={{
            fontSize: 12,
            color: COLORS.grayLight,
            textAlign: 'center',
            fontFamily: FONTS.mono,
          }}>
            {disputeMinutes} min left to dispute
          </div>
        )}

        {renderRatingCards()}

        {/* Dispute button */}
        {disputeWindowRemaining !== null && disputeWindowRemaining > 0 && (
          <button
            onClick={handleDispute}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid ' + COLORS.red,
              backgroundColor: 'transparent',
              color: COLORS.red,
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Nah fam, that&apos;s not right
          </button>
        )}
      </div>
    );
  }

  // ── Rating cards ──
  function renderRatingCards() {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
      }}>
        {RATING_OPTIONS.map(opt => (
          <button
            key={opt.type}
            onClick={() => handleRate(opt.type)}
            disabled={loading}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 8px',
              borderRadius: 14,
              border: '1px solid ' + opt.color + '44',
              backgroundColor: COLORS.card,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              gap: 4,
            }}
          >
            <span style={{ fontSize: 24 }}>{opt.emoji}</span>
            <span style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              letterSpacing: 1,
              color: opt.color,
            }}>
              {opt.label}
            </span>
            <span style={{
              fontSize: 11,
              color: COLORS.gray,
            }}>
              {opt.description}
            </span>
          </button>
        ))}
      </div>
    );
  }

  // ── Back home link ──
  function renderBackHome(message: string) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 15,
          color: COLORS.green,
          marginBottom: 12,
          fontWeight: 600,
        }}>
          {message}
        </div>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 32px',
            borderRadius: 10,
            backgroundColor: COLORS.card,
            color: COLORS.white,
            fontFamily: FONTS.body,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            border: '1px solid #333',
          }}
        >
          Back to Home
        </Link>
      </div>
    );
  }
}

// ── Sub-components ──

function ActionButton({
  label,
  subtitle,
  color,
  onPress,
  loading,
}: {
  label: string;
  subtitle?: string;
  color: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onPress}
      disabled={loading}
      style={{
        width: '100%',
        padding: subtitle ? '14px 16px' : '16px',
        borderRadius: 14,
        border: 'none',
        backgroundColor: color,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'opacity 0.15s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <span style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 28,
        letterSpacing: 3,
        color: '#080808',
        lineHeight: 1,
      }}>
        {loading ? '...' : label}
      </span>
      {subtitle && (
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          color: 'rgba(8, 8, 8, 0.7)',
        }}>
          {subtitle}
        </span>
      )}
    </button>
  );
}

function StatusMessage({ text }: { text: string }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '12px 0',
      fontSize: 15,
      color: COLORS.grayLight,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {text}
    </div>
  );
}

// ── Helpers ──

function getStatusNotification(status: string, isDriver: boolean): string {
  switch (status) {
    case 'otw':
      return isDriver ? 'You are on the way' : 'Driver is on the way!';
    case 'here':
      return isDriver ? 'You arrived at pickup' : 'Your driver is here!';
    case 'active':
      return 'Ride is now active';
    case 'ended':
      return 'Ride has ended';
    case 'completed':
      return 'Ride completed';
    case 'cancelled':
      return 'Ride was cancelled';
    default:
      return '';
  }
}
