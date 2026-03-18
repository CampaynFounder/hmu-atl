'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import ChatBooking from './chat-booking';
import type { EligibilityResult } from '@/lib/db/direct-bookings';

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
}

interface Props {
  driver: DriverData;
  autoOpenBooking: boolean;
}

export default function DriverShareProfileClient({ driver, autoOpenBooking }: Props) {
  const { isLoaded, isSignedIn } = useUser();
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch eligibility once auth is known
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    setEligibilityLoading(true);
    fetch(`/api/drivers/${driver.handle}/eligibility`)
      .then((r) => r.json())
      .then((data) => setEligibility(data))
      .finally(() => setEligibilityLoading(false));
  }, [isLoaded, isSignedIn, driver.handle]);

  // Auto-open drawer if rider just completed signup+onboarding
  useEffect(() => {
    if (autoOpenBooking && isLoaded && isSignedIn) {
      setDrawerOpen(true);
    }
  }, [autoOpenBooking, isLoaded, isSignedIn]);

  const signUpUrl = `/sign-up?type=rider&returnTo=/d/${driver.handle}`;

  const renderCtaButton = () => {
    if (!isLoaded || eligibilityLoading) {
      return (
        <button className="cta-btn cta-btn--loading" disabled>
          <span className="cta-btn__pulse" />
          Checking...
        </button>
      );
    }

    if (!isSignedIn) {
      return (
        <Link href={signUpUrl} className="cta-btn cta-btn--primary">
          Sign up to Book {driver.displayName}
        </Link>
      );
    }

    if (eligibility && !eligibility.eligible) {
      return (
        <div className="ineligible-block">
          <button className="cta-btn cta-btn--disabled" disabled>
            Can&apos;t book right now
          </button>
          <p className="ineligible-reason">{eligibility.reason}</p>
          {eligibility.code === 'og_required' && (
            <p className="ineligible-sub">
              Complete 10 rides with no disputes to become OG.
            </p>
          )}
          {eligibility.code === 'chill_score_low' && (
            <p className="ineligible-sub">
              Your Chill Score: {eligibility.riderChillScore.toFixed(0)}%
              &nbsp;— need {driver.minRiderChillScore}%
            </p>
          )}
          {eligibility.code === 'daily_limit_hit' && (
            <p className="ineligible-sub">
              {3 - eligibility.dailyBookingsUsed} of 3 requests used today.
            </p>
          )}
        </div>
      );
    }

    return (
      <button className="cta-btn cta-btn--primary" onClick={() => setDrawerOpen(true)}>
        Book {driver.displayName}
      </button>
    );
  };

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .profile-page { background: var(--black); color: #fff; min-height: 100svh; font-family: var(--font-body, 'DM Sans', sans-serif); padding-bottom: 100px; }
        .hero-photo { width: 100%; aspect-ratio: 4/3; object-fit: cover; background: var(--card); }
        .hero-photo-placeholder { width: 100%; aspect-ratio: 4/3; background: linear-gradient(135deg, #141414, #1a1a1a); display: flex; align-items: center; justify-content: center; font-size: 64px; }
        .profile-body { padding: 24px 20px 0; }
        .name-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .driver-name { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 48px; line-height: 1; }
        .hmu-first-badge { background: var(--green); color: var(--black); font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 100px; letter-spacing: 1px; text-transform: uppercase; white-space: nowrap; }
        .stats-row { display: flex; gap: 16px; margin-bottom: 20px; }
        .stat-pill { background: var(--card2); border: 1px solid var(--border); border-radius: 100px; padding: 6px 14px; font-size: 13px; color: var(--gray-light); display: flex; align-items: center; gap: 6px; }
        .stat-pill .value { color: var(--green); font-weight: 700; font-family: var(--font-mono, 'Space Mono', monospace); }
        .section-label { font-family: var(--font-mono, 'Space Mono', monospace); font-size: 10px; color: var(--gray); letter-spacing: 3px; text-transform: uppercase; margin-bottom: 10px; margin-top: 24px; }
        .area-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .area-chip { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; font-size: 13px; color: var(--gray-light); }
        .pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pricing-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
        .pricing-label { font-size: 12px; color: var(--gray); margin-bottom: 4px; }
        .pricing-value { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 28px; color: var(--green); line-height: 1; }
        .schedule-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .schedule-day { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; text-align: center; }
        .schedule-day.available { border-color: rgba(0,230,118,0.3); background: rgba(0,230,118,0.06); }
        .schedule-day-label { font-size: 10px; color: var(--gray); text-transform: uppercase; letter-spacing: 1px; }
        .schedule-day-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gray); margin: 4px auto 0; }
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
        {/* Hero: video intro or vehicle photo */}
        {driver.videoUrl ? (
          <video
            src={driver.videoUrl}
            className="hero-photo"
            autoPlay
            loop
            muted
            playsInline
            style={{ objectFit: 'cover' }}
          />
        ) : driver.vehiclePhotoUrl ? (
          <img src={driver.vehiclePhotoUrl} alt={`${driver.displayName}'s vehicle`} className="hero-photo" />
        ) : (
          <div className="hero-photo-placeholder">🚗</div>
        )}

        <div className="profile-body">
          {/* Name + badge */}
          <div className="name-row">
            <h1 className="driver-name">{driver.displayName}</h1>
            {driver.isHmuFirst && <span className="hmu-first-badge">HMU First</span>}
          </div>

          {/* Stats */}
          <div className="stats-row">
            <div className="stat-pill">
              Chill <span className="value">{driver.chillScore.toFixed(0)}%</span>
            </div>
            <div className="stat-pill">
              <span className="value">{driver.completedRides}</span> rides
            </div>
          </div>

          {/* Areas */}
          {driver.areas.length > 0 && (
            <>
              <p className="section-label">Serves</p>
              <div className="area-chips">
                {driver.areas.map((area) => (
                  <span key={area} className="area-chip">{area}</span>
                ))}
              </div>
            </>
          )}

          {/* Pricing */}
          {Object.keys(driver.pricing).length > 0 && (
            <>
              <p className="section-label">Pricing</p>
              <div className="pricing-grid">
                {driver.pricing.minimum != null && (
                  <div className="pricing-card">
                    <div className="pricing-label">Minimum</div>
                    <div className="pricing-value">${Number(driver.pricing.minimum).toFixed(0)}</div>
                  </div>
                )}
                {driver.pricing.base_rate != null && (
                  <div className="pricing-card">
                    <div className="pricing-label">Base Rate</div>
                    <div className="pricing-value">${Number(driver.pricing.base_rate).toFixed(0)}</div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Schedule */}
          {Object.keys(driver.schedule).length > 0 && (
            <>
              <p className="section-label">Availability</p>
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
            </>
          )}

          {/* Booking requirements */}
          {(driver.requireOgStatus || driver.minRiderChillScore > 0) && (
            <div className="requirements-block">
              <div className="requirements-title">Booking Requirements</div>
              <ul className="requirements-list">
                {driver.requireOgStatus && <li>OG Rider status (10+ rides, 0 disputes)</li>}
                {driver.minRiderChillScore > 0 && (
                  <li>Chill Score of {driver.minRiderChillScore}% or higher</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Sticky CTA */}
        <div className="cta-sticky">{renderCtaButton()}</div>
      </div>

      {/* Chat booking flow */}
      {isSignedIn && eligibility?.eligible && (
        <ChatBooking
          driver={driver}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  );
}
