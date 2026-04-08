'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { posthog } from '@/components/analytics/posthog-provider';
import GptChatBooking from './gpt-chat-booking';
import BookingDrawer from './booking-drawer';
import type { EligibilityResult } from '@/lib/db/direct-bookings';

const InlinePaymentForm = dynamic(() => import('@/components/payments/inline-payment-form'), { ssr: false });

interface DriverData {
  handle: string;
  displayName: string;
  areas: string[];
  pricing: Record<string, unknown>;
  schedule: Record<string, unknown>;
  videoUrl: string | null;
  vehiclePhotoUrl: string | null;
  isHmuFirst: boolean;
  chillScore: number;
  completedRides: number;
  acceptDirectBookings: boolean;
  minRiderChillScore: number;
  requireOgStatus: boolean;
  isLive: boolean;
  onRide: boolean;
  advanceNoticeHours: number;
  acceptsCash: boolean;
  cashOnly: boolean;
  vehicleInfo: { label: string; maxRiders: number | null } | null;
  services: { name: string; icon: string; price: number; pricingType: string; unitLabel: string | null }[];
}

interface Props {
  driver: DriverData;
  autoOpenBooking: boolean;
  isLoggedIn?: boolean;
  isPromo?: boolean;
}

export default function DriverShareProfileClient({ driver, autoOpenBooking, isLoggedIn, isPromo }: Props) {
  const { isLoaded, isSignedIn } = useUser();
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const [prefillData, setPrefillData] = useState<{ price?: string; pickup?: string; dropoff?: string; time?: string; resolvedTime?: string; timeDisplay?: string; stops?: string; roundTrip?: boolean; isCash?: boolean; driverMinimum?: number } | null>(null);
  const [videoMuted, setVideoMuted] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  // Track profile view + promo attribution
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const promo = params.get('promo');
    const utmSource = params.get('utm_source');
    const utmMedium = params.get('utm_medium');
    const utmCampaign = params.get('utm_campaign');

    posthog.capture('driver_profile_viewed', {
      driverHandle: driver.handle,
      driverName: driver.displayName,
      isLive: driver.isLive,
      viewerSignedIn: isSignedIn,
      isPromo: !!promo,
      promoType: promo || null,
      utmSource: utmSource || null,
      utmMedium: utmMedium || null,
      utmCampaign: utmCampaign || null,
      referrer: document.referrer || null,
    });
  }, [driver.handle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch eligibility once auth is known
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setEligibilityLoading(true);
    fetch(`/api/drivers/${driver.handle}/eligibility`)
      .then((r) => r.json())
      .then((data) => setEligibility(data))
      .finally(() => setEligibilityLoading(false));
  }, [isLoaded, isSignedIn, driver.handle]);

  // Helper to parse booking data into prefill format
  const parsePrefillData = (data: Record<string, unknown>) => ({
    price: data.riderPrice ? String(data.riderPrice) : data.price ? String(data.price) : data.suggestedPrice ? String(data.suggestedPrice) : undefined,
    pickup: (data.pickup as string) || (data.destination as string)?.split(/\s*(?:to|>|→)\s*/i)[0] || undefined,
    dropoff: (data.dropoff as string) || (data.destination as string)?.split(/\s*(?:to|>|→)\s*/i)[1] || undefined,
    time: (data.timeDisplay as string) || (data.time as string) || undefined,
    resolvedTime: (data.resolvedTime as string) || undefined,
    timeDisplay: (data.timeDisplay as string) || undefined,
    stops: (data.stops as string) || undefined,
    roundTrip: (data.roundTrip as boolean) || false,
    isCash: (data.isCash as boolean) || false,
    driverMinimum: data.driverMinimum ? Number(data.driverMinimum) : undefined,
  });

  // Auto-open booking form if rider just completed signup+onboarding (returned with bookingOpen=1)
  useEffect(() => {
    if (!autoOpenBooking || !isLoaded || !isSignedIn) return;

    // 1. Try localStorage first (same device)
    const driverKey = `hmu_chat_booking_${driver.handle}`;
    const saved = localStorage.getItem(driverKey) || localStorage.getItem('hmu_chat_booking');
    if (saved) {
      try {
        const raw = JSON.parse(saved);
        const data = raw.extracted || raw;
        setPrefillData(parsePrefillData(data));
      } catch { /* ignore */ }
      setBookingFormOpen(true);
      return;
    }

    // 2. No localStorage — try server-side draft (different device / cleared cache)
    fetch(`/api/rider/draft-booking?driverHandle=${driver.handle}`)
      .then(r => r.json())
      .then(res => {
        if (res.draft) {
          const data = (res.draft as Record<string, unknown>).extracted || res.draft;
          setPrefillData(parsePrefillData(data as Record<string, unknown>));
        }
      })
      .catch(() => {})
      .finally(() => setBookingFormOpen(true));
  }, [autoOpenBooking, isLoaded, isSignedIn, driver.handle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for saved chat progress and show recovery prompt (no bookingOpen param needed)
  const [hasSavedChat, setHasSavedChat] = useState(false);
  useEffect(() => {
    if (autoOpenBooking) return; // handled by the auto-open flow above
    try {
      const driverKey = `hmu_chat_booking_${driver.handle}`;
      const saved = localStorage.getItem(driverKey);
      if (saved) {
        const data = JSON.parse(saved);
        // Only show recovery if less than 24 hours old
        if (data.savedAt && Date.now() - data.savedAt < 24 * 60 * 60 * 1000) {
          setHasSavedChat(true);
        } else {
          localStorage.removeItem(driverKey);
        }
      }
    } catch { /* ignore */ }
  }, [driver.handle, autoOpenBooking]);

  const resumeSavedChat = () => {
    setHasSavedChat(false);
    setDrawerOpen(true);
  };

  const dismissSavedChat = () => {
    setHasSavedChat(false);
    localStorage.removeItem(`hmu_chat_booking_${driver.handle}`);
  };

  // Listen for chat-to-booking handoff (signed-in user confirmed via GPT chat)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, unknown> | undefined;
      if (detail) {
        setPrefillData({
          price: detail.riderPrice ? String(detail.riderPrice) : detail.price ? String(detail.price) : detail.suggestedPrice ? String(detail.suggestedPrice) : undefined,
          pickup: (detail.pickup as string) || (detail.destination as string)?.split(/\s*(?:to|>|→)\s*/i)[0] || undefined,
          dropoff: (detail.dropoff as string) || (detail.destination as string)?.split(/\s*(?:to|>|→)\s*/i)[1] || undefined,
          time: (detail.timeDisplay as string) || (detail.time as string) || undefined,
          resolvedTime: (detail.resolvedTime as string) || undefined,
          timeDisplay: (detail.timeDisplay as string) || undefined,
          stops: (detail.stops as string) || undefined,
          roundTrip: (detail.roundTrip as boolean) || false,
          isCash: (detail.isCash as boolean) || false,
          driverMinimum: detail.driverMinimum ? Number(detail.driverMinimum) : undefined,
        });
      }
      setDrawerOpen(false);
      setBookingFormOpen(true);
    };
    window.addEventListener('hmu-open-booking', handler);
    return () => window.removeEventListener('hmu-open-booking', handler);
  }, []);

  const signUpUrl = `/sign-up?type=rider&returnTo=/d/${driver.handle}`;

  const renderCtaButton = () => {
    // Always show the HMU button — GPT chat handles sign-up, payment, and booking
    return (
      <button className="cta-btn cta-btn--primary" onClick={() => {
        posthog.capture('hmu_button_clicked', { driverHandle: driver.handle, driverName: driver.displayName, isSignedIn });
        setDrawerOpen(true);
      }}>
        HMU {driver.displayName}{driver.cashOnly ? ' (Cash)' : ''}
      </button>
    );
  };

  return (
    <>
      <style>{`
        html, body { background: #080808 !important; }
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .profile-page { background: var(--black); color: #fff; min-height: 100svh; font-family: var(--font-body, 'DM Sans', sans-serif); padding-bottom: 100px; padding-top: 56px; overflow-x: hidden; max-width: 100vw; }
        .hero-photo { width: 100%; display: block; background: var(--black); }
        .hero-photo-img { width: 100%; display: block; background: var(--black); }
        .hero-photo-placeholder { width: 100%; aspect-ratio: 1/1; background: #080808; display: flex; align-items: center; justify-content: center; }
        .profile-body { padding: 24px 20px 0; overflow: hidden; }
        .name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; min-width: 0; }
        .driver-name { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 48px; line-height: 1; word-break: break-word; }
        .hmu-first-badge { background: rgba(0,230,118,0.15); color: var(--green); font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 100px; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; }
        .stats-row { display: flex; gap: 16px; margin-bottom: 20px; }
        .stat-pill { background: var(--card2); border: 1px solid var(--border); border-radius: 100px; padding: 6px 14px; font-size: 13px; color: var(--gray-light); display: flex; align-items: center; gap: 6px; }
        .stat-pill .value { color: var(--green); font-weight: 700; font-family: var(--font-mono, 'Space Mono', monospace); }
        .section-label { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px; margin-top: 24px; }
        .area-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .area-chip { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: 13px; color: var(--gray-light); }
        .section-sub { font-size: 13px; color: var(--gray); margin-bottom: 12px; line-height: 1.4; }
        .pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pricing-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; animation: priceIn 0.6s ease-out both; }
        .pricing-card:nth-child(1) { animation-delay: 0.1s; }
        .pricing-card:nth-child(2) { animation-delay: 0.2s; }
        .pricing-card:nth-child(3) { animation-delay: 0.3s; }
        .pricing-card:nth-child(4) { animation-delay: 0.4s; }
        @keyframes priceIn { from { opacity: 0; transform: translateY(12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .pricing-label { font-size: 12px; color: var(--gray); margin-bottom: 4px; }
        .pricing-value { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 28px; color: var(--green); line-height: 1; animation: countUp 0.8s ease-out both; }
        @keyframes countUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .pricing-value .dollar { font-size: 18px; opacity: 0.7; }
        .schedule-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .schedule-day { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; text-align: center; animation: dayIn 0.4s ease-out both; }
        .schedule-day:nth-child(1) { animation-delay: 0.05s; }
        .schedule-day:nth-child(2) { animation-delay: 0.1s; }
        .schedule-day:nth-child(3) { animation-delay: 0.15s; }
        .schedule-day:nth-child(4) { animation-delay: 0.2s; }
        .schedule-day:nth-child(5) { animation-delay: 0.25s; }
        .schedule-day:nth-child(6) { animation-delay: 0.3s; }
        .schedule-day:nth-child(7) { animation-delay: 0.35s; }
        @keyframes dayIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        .schedule-day.available { border-color: rgba(0,230,118,0.3); background: rgba(0,230,118,0.06); }
        .schedule-day-label { font-size: 10px; color: var(--gray); text-transform: uppercase; letter-spacing: 1px; }
        .schedule-day-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gray); margin: 4px auto 0; transition: background 0.3s; }
        .schedule-day.available .schedule-day-dot { background: var(--green); }
        .cta-sticky { position: fixed; bottom: 0; left: 0; right: 0; padding: 16px 20px; background: linear-gradient(to top, rgba(8,8,8,0.98) 70%, transparent); z-index: 50; }
        .cta-btn { width: 100%; padding: 18px; border-radius: 100px; border: none; font-family: var(--font-body, 'DM Sans', sans-serif); font-weight: 700; font-size: 17px; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; text-decoration: none; display: block; text-align: center; }
        .cta-btn--primary { background: var(--green); color: var(--black); }
        .cta-btn--primary:hover { transform: scale(1.02); box-shadow: 0 0 32px rgba(0,230,118,0.25); }
        .cta-btn--disabled { background: #2a2a2a; color: #555; cursor: not-allowed; }
        .cta-btn--loading { background: rgba(0,230,118,0.2); color: var(--green); display: flex; align-items: center; justify-content: center; gap: 8px; }
        .cta-btn__pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse 1.2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        .ineligible-block { display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .ineligible-reason { font-size: 13px; color: #FFB300; text-align: center; }
        .ineligible-sub { font-size: 12px; color: var(--gray); text-align: center; }
        .requirements-block { background: rgba(255,179,0,0.06); border: 1px solid rgba(255,179,0,0.2); border-radius: 12px; padding: 14px 16px; margin-top: 12px; }
        .requirements-title { font-size: 11px; color: #FFB300; font-family: var(--font-mono, monospace); letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
        .requirements-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
        .requirements-list li { font-size: 13px; color: var(--gray-light); display: flex; align-items: center; gap: 8px; }
        .requirements-list li::before { content: '→'; color: #FFB300; }
        .share-link { display: flex; align-items: center; gap: 8px; background: var(--card2); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; margin-top: 8px; }
        .share-link-text { font-family: var(--font-mono, monospace); font-size: 13px; color: var(--gray-light); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>

      <div className="profile-page">
        {/* Recovery banner for saved chat progress */}
        {hasSavedChat && (
          <div style={{
            margin: '12px 20px', padding: '14px 16px', borderRadius: 14,
            background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.4 }}>
              <strong style={{ color: '#fff' }}>Continue your booking?</strong><br />
              You had a conversation in progress.
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={dismissSavedChat} style={{
                padding: '8px 14px', borderRadius: 100, border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Dismiss</button>
              <button onClick={resumeSavedChat} style={{
                padding: '8px 14px', borderRadius: 100, border: 'none',
                background: '#00E676', color: '#080808', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>Continue</button>
            </div>
          </div>
        )}

        {/* Back to browse — logged-in riders */}
        {isLoggedIn && (
          <Link
            href="/rider/browse"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px',
              fontSize: 14, fontWeight: 600,
              color: '#00E676',
              textDecoration: 'none',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            <span style={{ fontSize: 18 }}>&larr;</span> Browse Drivers
          </Link>
        )}

        {/* Hero: show both video + photo if both exist, otherwise one or placeholder */}
        {driver.videoUrl && driver.vehiclePhotoUrl ? (
          <>
            {/* Vehicle photo first */}
            <img src={driver.vehiclePhotoUrl} alt={`${driver.displayName}'s vehicle`} className="hero-photo-img" />
            {/* Video intro below */}
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setVideoMuted(!videoMuted)}>
              <video
                src={driver.videoUrl}
                className="hero-photo"
                autoPlay
                loop
                muted={videoMuted}
                playsInline
                style={{ objectFit: 'cover', maxHeight: '300px' }}
              />
              <div style={{
                position: 'absolute', bottom: '16px', right: '16px',
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                borderRadius: '100px', padding: '8px 14px',
                fontSize: '13px', color: '#fff', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                {videoMuted ? '\uD83D\uDD07 Tap for sound' : '\uD83D\uDD0A Sound on'}
              </div>
            </div>
          </>
        ) : driver.videoUrl ? (
          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setVideoMuted(!videoMuted)}>
            <video
              src={driver.videoUrl}
              className="hero-photo"
              autoPlay
              loop
              muted={videoMuted}
              playsInline
              style={{ objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute', bottom: '16px', right: '16px',
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
              borderRadius: '100px', padding: '8px 14px',
              fontSize: '13px', color: '#fff', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {videoMuted ? '\uD83D\uDD07 Tap for sound' : '\uD83D\uDD0A Sound on'}
            </div>
          </div>
        ) : driver.vehiclePhotoUrl ? (
          <img src={driver.vehiclePhotoUrl} alt={`${driver.displayName}'s vehicle`} className="hero-photo-img" />
        ) : (
          <div className="hero-photo-placeholder">
            <svg viewBox="0 0 512 512" style={{ width: '60%', height: '60%' }}>
              <path d="M 155 140 L 155 310 A 120 120 0 0 0 355 310 L 355 160" fill="none" stroke="#00E676" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round"/>
              <polygon points="355,55 275,175 435,175" fill="#00E676"/>
            </svg>
          </div>
        )}

        <div className="profile-body">
          {/* Name row + driver CTA */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div className="name-row" style={{ marginBottom: 0 }}>
              <h1 className="driver-name">{driver.displayName}</h1>
              {driver.isHmuFirst && <span className="hmu-first-badge">{'\uD83E\uDD47'} HMU 1st</span>}
            {driver.acceptsCash && (
              <span style={{
                background: 'rgba(76,175,80,0.15)', color: '#4CAF50',
                fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 100,
                letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap',
              }}>
                {driver.cashOnly ? 'Cash Only' : 'Cash OK'}
              </span>
            )}
            </div>
            {/* Driver sign up CTA — only for logged out visitors */}
            {!isLoggedIn && <DriverSignUpCta isPromo={isPromo} />}
          </div>
          {/* Availability Status */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: driver.isLive && !driver.onRide
              ? 'rgba(0,230,118,0.1)' : driver.onRide
              ? 'rgba(255,179,0,0.1)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${driver.isLive && !driver.onRide
              ? 'rgba(0,230,118,0.25)' : driver.onRide
              ? 'rgba(255,179,0,0.25)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 100, padding: '5px 14px', marginBottom: 12,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: driver.isLive && !driver.onRide ? '#00E676' : driver.onRide ? '#FFB300' : '#555',
              animation: driver.isLive && !driver.onRide ? 'pulse 1.2s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: driver.isLive && !driver.onRide ? '#00E676' : driver.onRide ? '#FFB300' : '#888',
              letterSpacing: 2, textTransform: 'uppercase',
              fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            }}>
              {driver.isLive && !driver.onRide ? 'HMU Now' : driver.onRide ? 'On a Ride' : 'Offline'}
            </span>
          </div>
          {driver.advanceNoticeHours > 0 && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 8, marginTop: -4 }}>
              Requires {driver.advanceNoticeHours}hr advance notice
            </div>
          )}

          {/* Vehicle + Capacity */}
          {driver.vehicleInfo && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
              fontSize: 14, color: '#bbb',
            }}>
              <svg width="18" height="18" viewBox="0 0 512 512" style={{ flexShrink: 0 }}>
                <path d="M 155 140 L 155 310 A 120 120 0 0 0 355 310 L 355 160" fill="none" stroke="#00E676" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round"/>
                <polygon points="355,55 275,175 435,175" fill="#00E676"/>
              </svg>
              <span style={{ fontWeight: 600 }}>{driver.vehicleInfo.label}</span>
              {driver.vehicleInfo.maxRiders && (
                <span style={{
                  fontSize: 11, color: '#888', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 100,
                  padding: '2px 8px',
                }}>
                  {driver.vehicleInfo.maxRiders} riders max
                </span>
              )}
            </div>
          )}

          {/* Vibe Tier + Rides */}
          <div style={{ marginBottom: 20 }}>
            <div className="stats-row" style={{ marginBottom: 10 }}>
              <div className="stat-pill">
                <span className="value">{driver.completedRides}</span> rides
              </div>
            </div>
            <VibeRatingBar score={driver.chillScore} />
          </div>

          {/* Pricing */}
          <p className="section-label">Pricing</p>
          <p className="section-sub">
            {driver.pricing.minimum
              ? `Don\u2019t HMU for less than $${Number(driver.pricing.minimum).toFixed(0)}. You name your price, I accept or pass.`
              : 'You name your price, I accept or pass. No surge, no fees.'}
          </p>
          <div className="pricing-grid">
            {driver.pricing.minimum != null && Number(driver.pricing.minimum) > 0 && (
              <div className="pricing-card">
                <div className="pricing-label">Don&apos;t HMU for less than</div>
                <div className="pricing-value"><span className="dollar">$</span>{Number(driver.pricing.minimum).toFixed(0)}</div>
              </div>
            )}
            {driver.pricing.base_rate != null && Number(driver.pricing.base_rate) > 0 && (
              <div className="pricing-card">
                <div className="pricing-label">30 min ride</div>
                <div className="pricing-value"><span className="dollar">$</span>{Number(driver.pricing.base_rate).toFixed(0)}</div>
              </div>
            )}
            {driver.pricing.hourly != null && Number(driver.pricing.hourly) > 0 && (
              <div className="pricing-card">
                <div className="pricing-label">1 hour</div>
                <div className="pricing-value"><span className="dollar">$</span>{Number(driver.pricing.hourly).toFixed(0)}</div>
              </div>
            )}
            {driver.pricing.out_of_town != null && Number(driver.pricing.out_of_town) > 0 && (
              <div className="pricing-card">
                <div className="pricing-label">Out of town / hr</div>
                <div className="pricing-value"><span className="dollar">$</span>{Number(driver.pricing.out_of_town).toFixed(0)}</div>
              </div>
            )}
          </div>

          {/* Menu Add-Ons */}
          {driver.services.length > 0 && (
            <>
              <p className="section-label">Extras</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {driver.services.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.15)',
                    borderRadius: 14, padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{s.icon}</span>
                      <span style={{ fontSize: 13, color: '#ddd', fontWeight: 500 }}>{s.name}</span>
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: '#00E676',
                      fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                    }}>
                      ${s.price.toFixed(2)}
                      {s.pricingType === 'per_unit' && s.unitLabel ? `/${s.unitLabel}` : ''}
                      {s.pricingType === 'per_minute' ? '/min' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Areas */}
          {driver.areas.length > 0 && (
            <>
              <p className="section-label">Areas</p>
              <p className="section-sub">Where I ride. Multi-stop and round trip available.</p>
              <div className="area-chips">
                {driver.areas.map((area) => (
                  <span key={area} className="area-chip">{area}</span>
                ))}
              </div>
            </>
          )}

          {/* Schedule */}
          <p className="section-label">Availability</p>
          <p className="section-sub">Green = I&apos;m active. Tap Book to request a day.</p>
          <div className="schedule-grid">
            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => {
              const key = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' }[d]!;
              const avail = (driver.schedule[key] as { available?: boolean } | undefined)?.available ?? false;
              return (
                <div key={d} className={`schedule-day${avail ? ' available' : ''}`}>
                  <div className="schedule-day-label">{d}</div>
                  <div className="schedule-day-dot" />
                </div>
              );
            })}
          </div>

          {/* Booking requirements */}
          {(driver.requireOgStatus || driver.minRiderChillScore > 0) && (
            <div className="requirements-block">
              <div className="requirements-title">Booking Requirements</div>
              <ul className="requirements-list">
                {driver.requireOgStatus && <li>OG Rider status (10+ rides, 0 disputes)</li>}
                {driver.minRiderChillScore > 0 && (
                  <li>{driver.minRiderChillScore >= 90 ? 'Cool AF' : driver.minRiderChillScore >= 75 ? 'CHILL' : 'Aight'} vibe or higher</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Sticky CTA */}
        <div className="cta-sticky">{renderCtaButton()}</div>
      </div>

      {/* GPT discovery chat — for all visitors */}
      <GptChatBooking
        driver={driver}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Booking form — for signed-in users (after chat handoff or return from sign-up) */}
      {isSignedIn && (
        <BookingDrawer
          driver={driver}
          open={bookingFormOpen}
          onClose={() => { setBookingFormOpen(false); setPrefillData(null); }}
          prefill={prefillData}
        />
      )}
    </>
  );
}

const DRIVER_PAIN_POINTS = [
  'Time Wasters',
  'No Payment',
  'Uber Fees',
  'Finessers',
  'Scammers',
  'Surge Pricing',
  'No-Shows',
];

/** Horizontal audio-meter style vibe bar — red→yellow→green gradient with animated fill */
function VibeRatingBar({ score }: { score: number }) {
  const [animatedWidth, setAnimatedWidth] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger the rise animation after mount
    const t1 = setTimeout(() => setMounted(true), 100);
    const t2 = setTimeout(() => setAnimatedWidth(Math.min(100, Math.max(0, score))), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [score]);

  const tiers = [
    { label: 'WEIRDO', emoji: '\uD83D\uDEA9', pos: 0 },
    { label: 'Sketchy', emoji: '\uD83D\uDC40', pos: 25 },
    { label: 'Aight', emoji: '\uD83E\uDD37', pos: 50 },
    { label: 'CHILL', emoji: '\u2705', pos: 75 },
    { label: 'Cool AF', emoji: '\uD83D\uDE0E', pos: 92 },
  ];

  const currentTier = score >= 90 ? 'Cool AF' : score >= 75 ? 'CHILL' : score >= 50 ? 'Aight' : score >= 25 ? 'Sketchy' : 'WEIRDO';
  const tierColor = score >= 75 ? '#00E676' : score >= 50 ? '#FFD600' : score >= 25 ? '#FF9100' : '#FF5252';

  return (
    <div style={{ padding: '2px 0' }}>
      <style>{`
        @keyframes meterGlow { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }
        @keyframes meterShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>

      {/* Meter track */}
      <div style={{
        position: 'relative', height: 14, borderRadius: 100,
        background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        {/* Gradient fill — animates from 0 to score width */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: `${animatedWidth}%`,
          borderRadius: 100,
          background: 'linear-gradient(90deg, #FF5252 0%, #FF9100 25%, #FFD600 50%, #8BC34A 75%, #00E676 100%)',
          transition: mounted ? 'width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
          boxShadow: `0 0 12px ${tierColor}40`,
          animation: mounted && animatedWidth > 0 ? 'meterGlow 2s ease-in-out infinite' : 'none',
        }}>
          {/* Shimmer overlay */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 100,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: mounted ? 'meterShimmer 3s ease-in-out infinite' : 'none',
          }} />
        </div>

        {/* Tick marks at tier boundaries */}
        {[25, 50, 75, 90].map(pos => (
          <div key={pos} style={{
            position: 'absolute', top: 0, bottom: 0, left: `${pos}%`,
            width: 1, background: 'rgba(255,255,255,0.1)',
          }} />
        ))}
      </div>

      {/* Tier labels underneath */}
      <div style={{ position: 'relative', height: 28, marginTop: 6 }}>
        {tiers.map(t => {
          const isActive = t.label === currentTier;
          return (
            <div key={t.label} style={{
              position: 'absolute',
              left: `${t.pos}%`,
              transform: t.pos > 80 ? 'translateX(-80%)' : t.pos === 0 ? 'none' : 'translateX(-40%)',
              textAlign: 'center',
              transition: 'all 0.5s ease',
            }}>
              <div style={{
                fontSize: isActive ? 12 : 9,
                fontWeight: isActive ? 800 : 500,
                color: isActive ? tierColor : '#555',
                whiteSpace: 'nowrap',
                lineHeight: 1,
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}>
                {isActive ? `${t.emoji} ${t.label}` : t.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DriverSignUpCta({ isPromo }: { isPromo?: boolean }) {
  const [currentPain, setCurrentPain] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setCurrentPain(prev => (prev + 1) % DRIVER_PAIN_POINTS.length);
        setAnimating(false);
      }, 400);
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <Link
      href="/sign-up?type=driver"
      onClick={() => posthog.capture('driver_cta_on_hmu_link')}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textDecoration: 'none', flexShrink: 0,
        gap: 8,
      }}
    >
      <style>{`
        @keyframes fadeSwap {
          0% { opacity: 1; transform: translateY(0); }
          40% { opacity: 0; transform: translateY(-6px); }
          60% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes prohibitGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(255,82,82,0); }
          50% { box-shadow: 0 0 12px rgba(255,82,82,0.4); }
        }
        @keyframes promoPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 8px rgba(0,230,118,0.3); }
          50% { transform: scale(1.08); box-shadow: 0 0 20px rgba(0,230,118,0.6); }
        }
      `}</style>

      {/* Prohibited circle with pain point */}
      <div style={{
        position: 'relative', width: 68, height: 68,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        border: '3px solid #FF5252',
        animation: 'prohibitGlow 2.2s ease-in-out infinite',
        overflow: 'hidden',
      }}>
        {/* Diagonal strike — connects edge to edge */}
        <div style={{
          position: 'absolute',
          width: '140%', height: 3, background: '#FF5252',
          transform: 'rotate(-45deg)',
          zIndex: 2,
        }} />
        {/* Pain point text */}
        <div style={{
          fontSize: 10, fontWeight: 800, color: '#FF5252',
          textAlign: 'center', lineHeight: 1.15,
          padding: '0 8px',
          textTransform: 'uppercase', letterSpacing: 0.3,
          animation: animating ? 'fadeSwap 0.4s ease-in-out' : 'none',
          zIndex: 1,
        }}>
          {DRIVER_PAIN_POINTS[currentPain]}
        </div>
      </div>

      {/* CTA button */}
      <div style={{
        background: isPromo ? '#00E676' : '#080808',
        color: isPromo ? '#080808' : '#00E676',
        fontSize: isPromo ? 11 : 10, fontWeight: 800, letterSpacing: 0.5,
        padding: isPromo ? '8px 16px' : '6px 14px', borderRadius: 100,
        textAlign: 'center', lineHeight: 1.2,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        border: isPromo ? 'none' : '1.5px solid #00E676',
        boxShadow: '0 0 8px rgba(0,230,118,0.3)',
        animation: isPromo ? 'promoPulse 2s ease-in-out infinite' : 'none',
      }}>
        {isPromo ? 'Create FREE Profile \u2192' : 'Drive with HMU \u2192'}
      </div>
    </Link>
  );
}
