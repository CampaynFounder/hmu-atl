'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { posthog } from '@/components/analytics/posthog-provider';
import GptChatBooking from './gpt-chat-booking';
import BookingDrawer from './booking-drawer';
import { DriverBlockerModal } from './driver-blocker-modal';
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
  verificationStatus?: 'verified' | 'pending';
}

interface Props {
  driver: DriverData;
  autoOpenBooking: boolean;
  isLoggedIn?: boolean;
  isPromo?: boolean;
  chatBookingEnabled: boolean;
}

export default function DriverShareProfileClient({ driver, autoOpenBooking, isLoggedIn, isPromo, chatBookingEnabled }: Props) {
  const { isLoaded, isSignedIn } = useUser();
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  // Viewer's own profile type + driver handle, used to decide whether the
  // HMU button opens the chat or shows the soft blocker modal.
  const [viewerProfile, setViewerProfile] = useState<{ profileType: string; driverHandle: string | null } | null>(null);
  const [blockerVariant, setBlockerVariant] = useState<'own' | 'other' | null>(null);
  const [prefillData, setPrefillData] = useState<{ price?: string; pickup?: string; dropoff?: string; time?: string; resolvedTime?: string; timeDisplay?: string; stops?: string; roundTrip?: boolean; isCash?: boolean; driverMinimum?: number; estimatedRideMinutes?: number } | null>(null);
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

  // Fetch viewer's own profile type once we know they're signed in.
  // Used to branch the HMU button between chat and soft-blocker modal.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setViewerProfile(null);
      return;
    }
    fetch('/api/users/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.profileType) {
          setViewerProfile({ profileType: data.profileType, driverHandle: data.driverHandle || null });
        }
      })
      .catch(() => {});
  }, [isLoaded, isSignedIn]);

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
    estimatedRideMinutes: data.estimatedRideMinutes ? Number(data.estimatedRideMinutes) : undefined,
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
          estimatedRideMinutes: detail.estimatedRideMinutes ? Number(detail.estimatedRideMinutes) : undefined,
        });
      }
      setDrawerOpen(false);
      setBookingFormOpen(true);
    };
    window.addEventListener('hmu-open-booking', handler);
    return () => window.removeEventListener('hmu-open-booking', handler);
  }, []);

  const signUpUrl = `/sign-up?type=rider&returnTo=/d/${driver.handle}`;

  const handleHmuClick = () => {
    posthog.capture('hmu_button_clicked', {
      driverHandle: driver.handle,
      driverName: driver.displayName,
      isSignedIn,
      viewerProfileType: viewerProfile?.profileType,
      chatBookingEnabled,
    });

    // Signed-in driver lands on the soft-blocker regardless of chat state.
    if (isSignedIn && viewerProfile?.profileType === 'driver') {
      const isOwnPage = viewerProfile.driverHandle === driver.handle;
      setBlockerVariant(isOwnPage ? 'own' : 'other');
      return;
    }

    // Chat disabled for this driver → skip chat entirely. BookingDrawer
    // renders for logged-out riders too now: they fill in ride details, the
    // drawer saves to localStorage and redirects to sign-up/sign-in, and the
    // existing autoOpenBooking effect restores the draft on return.
    if (!chatBookingEnabled) {
      setPrefillData(null);
      setBookingFormOpen(true);
      return;
    }

    // Chat enabled: default behavior for logged-out / rider viewers.
    setDrawerOpen(true);
  };

  const renderCtaButton = () => {
    // Always show the HMU button — GPT chat handles sign-up, payment, and booking
    return (
      <button className="cta-btn cta-btn--primary" onClick={handleHmuClick}>
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

          {/* New-driver verification banner — appears when express drivers
              have not yet completed legal name + license plate. Soft, not
              fear-mongering: rider sees the trust gap up front and we point
              at completed-rides as the social proof to look at instead. */}
          {driver.verificationStatus === 'pending' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                background: 'rgba(255,193,7,0.08)',
                border: '1px solid rgba(255,193,7,0.25)',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: 14,
                fontSize: 12,
                color: '#FFD86E',
                lineHeight: 1.45,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{'⚠️'}</span>
              <div>
                <strong style={{ color: '#FFE9A3' }}>New Driver Verification in Progress</strong>
              </div>
            </div>
          )}

          {/* Vibe Meter — prominent, right below name */}
          <div style={{ marginBottom: 14 }}>
            <VibeRatingBar score={driver.chillScore} delayMs={600} />
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

          {/* Ride count */}
          <div className="stats-row" style={{ marginBottom: 20 }}>
            <div className="stat-pill">
              <span className="value">{driver.completedRides}</span> rides
            </div>
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

      {/* GPT discovery chat — only rendered when the admin flag is on for
          this driver. Keeps the bundle leaner on disabled drivers and avoids
          any chance of the chat modal mounting on a disabled profile. */}
      {chatBookingEnabled && (
        <GptChatBooking
          driver={driver}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}


      {/* Booking form — renders for logged-out riders too. The drawer gates
          the real POST and payment UI on isSignedIn, and falls back to
          "save ride details + route to sign-up" for anonymous callers. */}
      <BookingDrawer
        driver={driver}
        open={bookingFormOpen}
        onClose={() => { setBookingFormOpen(false); setPrefillData(null); }}
        prefill={prefillData}
        isSignedIn={!!isSignedIn}
      />

      {/* Soft blocker — driver tapped HMU on a driver profile */}
      <DriverBlockerModal
        open={blockerVariant !== null}
        variant={blockerVariant ?? 'other'}
        driverDisplayName={driver.displayName}
        onClose={() => setBlockerVariant(null)}
      />
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

/**
 * 90s-style signal meter — stacked block pairs that light up left→right,
 * red→orange→yellow→green, with cascade animation on load.
 */
function VibeRatingBar({ score, delayMs = 0 }: { score: number; delayMs?: number }) {
  const [litCount, setLitCount] = useState(0);

  const TOTAL_BARS = 20;
  const scorePercent = Math.min(100, Math.max(0, score));
  const targetLit = Math.round((scorePercent / 100) * TOTAL_BARS);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    // Wait for page load then cascade animation
    const timeout = setTimeout(() => {
      let i = 0;
      interval = setInterval(() => {
        i++;
        setLitCount(i);
        if (i >= targetLit) clearInterval(interval);
      }, 60);
    }, delayMs);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [targetLit, delayMs]);

  // Color for each bar position (left=red, right=green)
  function barColor(index: number): string {
    const pct = index / (TOTAL_BARS - 1);
    if (pct < 0.25) return '#FF5252';
    if (pct < 0.40) return '#FF7043';
    if (pct < 0.55) return '#FF9100';
    if (pct < 0.65) return '#FFC107';
    if (pct < 0.75) return '#FFD600';
    if (pct < 0.85) return '#8BC34A';
    return '#00E676';
  }

  // Bar heights — grow taller left to right like signal bars
  function barHeight(index: number): { top: number; bottom: number } {
    const pct = index / (TOTAL_BARS - 1);
    const h = 8 + Math.round(pct * 18); // 8px → 26px
    return { top: h, bottom: h };
  }

  const currentTier = score >= 90 ? 'Cool AF' : score >= 75 ? 'CHILL' : score >= 50 ? 'Aight' : score >= 25 ? 'Sketchy' : 'WEIRDO';
  const tierEmoji = score >= 90 ? '\uD83D\uDE0E' : score >= 75 ? '\u2705' : score >= 50 ? '\uD83E\uDD37' : score >= 25 ? '\uD83D\uDC40' : '\uD83D\uDEA9';
  const tierColor = score >= 75 ? '#00E676' : score >= 50 ? '#FFD600' : score >= 25 ? '#FF9100' : '#FF5252';

  return (
    <div>
      <style>{`
        @keyframes blockPop { 0% { transform: scaleY(0); } 60% { transform: scaleY(1.15); } 100% { transform: scaleY(1); } }
        @keyframes blockGlow { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
      `}</style>

      {/* Label */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{
          fontSize: 10, color: '#888',
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          letterSpacing: 3, textTransform: 'uppercase',
        }}>
          Vibe
        </div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: tierColor,
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span>{tierEmoji}</span>
          <span>{currentTier}</span>
        </div>
      </div>

      {/* Meter — stacked block pairs */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 3,
        height: 30, padding: '0 2px',
      }}>
        {Array.from({ length: TOTAL_BARS }, (_, i) => {
          const lit = i < litCount;
          const color = barColor(i);
          const { top } = barHeight(i);
          const isLastLit = i === litCount - 1 && litCount === targetLit;

          return (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column', gap: 2,
              flex: 1, alignItems: 'stretch',
              transformOrigin: 'bottom',
              animation: lit ? `blockPop 0.25s ease-out ${i * 0.03}s both` : 'none',
            }}>
              {/* Top block */}
              <div style={{
                height: Math.round(top * 0.45),
                borderRadius: 2,
                background: lit ? color : '#1a1a1a',
                opacity: lit ? 1 : 0.3,
                transition: 'background 0.15s, opacity 0.15s',
                boxShadow: lit ? `0 0 6px ${color}50` : 'none',
                animation: isLastLit ? 'blockGlow 1.5s ease-in-out infinite' : 'none',
              }} />
              {/* Bottom block */}
              <div style={{
                height: Math.round(top * 0.55),
                borderRadius: 2,
                background: lit ? color : '#1a1a1a',
                opacity: lit ? 1 : 0.3,
                transition: 'background 0.15s, opacity 0.15s',
                boxShadow: lit ? `0 0 6px ${color}50` : 'none',
                animation: isLastLit ? 'blockGlow 1.5s ease-in-out infinite' : 'none',
              }} />
            </div>
          );
        })}
      </div>

      {/* Tier labels underneath */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 6, padding: '0 2px',
      }}>
        {[
          { label: 'WEIRDO', color: '#FF5252' },
          { label: 'Sketchy', color: '#FF9100' },
          { label: 'Aight', color: '#FFD600' },
          { label: 'CHILL', color: '#8BC34A' },
          { label: 'Cool AF', color: '#00E676' },
        ].map(t => (
          <span key={t.label} style={{
            fontSize: t.label === currentTier ? 10 : 8,
            fontWeight: t.label === currentTier ? 800 : 500,
            color: t.label === currentTier ? t.color : '#444',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            transition: 'all 0.3s',
          }}>
            {t.label}
          </span>
        ))}
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
        gap: 6, opacity: 0.45,
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.45'; }}
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
        position: 'relative', width: 52, height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
        border: '2px solid #FF5252',
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
          fontSize: 8, fontWeight: 800, color: '#FF5252',
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
        background: isPromo ? '#00E676' : 'transparent',
        color: isPromo ? '#080808' : '#888',
        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
        padding: '5px 12px', borderRadius: 100,
        textAlign: 'center', lineHeight: 1.2,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        border: isPromo ? 'none' : '1px solid rgba(255,255,255,0.12)',
      }}>
        {isPromo ? 'Create FREE Profile \u2192' : 'Drive with HMU'}
      </div>
    </Link>
  );
}
