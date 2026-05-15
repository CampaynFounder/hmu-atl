'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { VideoRecorder } from '@/components/onboarding/video-recorder';
import PayoutSection from './payout-section';
import DealPill from '@/components/driver/deal-pill';
import SafetySettings from '@/components/profile/safety-settings';
import { AddressAutocomplete } from '@/components/ride/address-autocomplete';
import { posthog } from '@/components/analytics/posthog-provider';
import type { ValidatedAddress } from '@/lib/db/types';

const DriverPaymentForm = dynamic(() => import('@/components/payments/driver-payment-form'), { ssr: false });

interface ProfileData {
  handle: string;
  displayName: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  pronouns: string;
  lgbtqFriendly: boolean;
  areas: string[]; // legacy
  areaSlugs: string[];
  servicesEntireMarket: boolean;
  acceptsLongDistance: boolean;
  pricing: Record<string, unknown>;
  schedule: Record<string, unknown>;
  videoUrl: string;
  vibeVideoUrl: string;
  vehiclePhotoUrl: string;
  licensePlate: string;
  plateState: string;
  acceptDirectBookings: boolean;
  minRiderChillScore: number;
  requireOgStatus: boolean;
  showVideoOnLink: boolean;
  profileVisible: boolean;
  fwu: boolean;
  acceptsCash: boolean;
  cashOnly: boolean;
  allowInRouteStops: boolean;
  waitMinutes: number;
  advanceNoticeHours: number;
  /** Driver-set deposit floor for deposit-only mode. Null = use admin floor. */
  depositFloor: number | null;
  /** Driver's curated home base. Null until the driver sets it. Distinct
   *  from passive GPS (current_lat/lng) which goes stale after 5 minutes. */
  homeLat: number | null;
  homeLng: number | null;
  homeLabel: string | null;
  homeMapboxId: string | null;
}

type Cardinal = 'westside' | 'eastside' | 'northside' | 'southside' | 'central';
interface MarketAreaChip {
  slug: string;
  name: string;
  cardinal: Cardinal;
}

interface UserData {
  tier: string;
  chillScore: number;
  completedRides: number;
}

interface PayoutData {
  setupComplete: boolean;
  last4: string | null;
  accountType: string | null;
  bankName: string | null;
}

interface SubscriptionData {
  status: string | null;
  subscriptionId: string | null;
}

interface Props {
  profile: ProfileData;
  user: UserData;
  payout: PayoutData;
  subscription: SubscriptionData;
  market: { slug: string; name: string };
  marketAreas: MarketAreaChip[];
  /** False when the active pricing strategy disallows full-cash rides
   *  (e.g. deposit_only). Hides the Accepts Cash + Cash Only toggles. */
  cashAllowed: boolean;
}

const CARDINAL_ORDER: Cardinal[] = ['central', 'northside', 'eastside', 'southside', 'westside'];
const CARDINAL_LABEL: Record<Cardinal, string> = {
  central: 'Central',
  northside: 'Northside',
  eastside: 'Eastside',
  southside: 'Southside',
  westside: 'Westside',
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

// Collapsible section. Each section persists its open/closed state per
// id under localStorage 'dp_section_<id>'. The activation checklist
// deep-links via /driver/profile?focus=<id> — that section auto-opens
// and scrolls into view on mount, regardless of stored state.
function Section({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get('focus');
    if (focus === id) {
      setOpen(true);
      const el = document.getElementById(`dp-section-${id}`);
      if (el) {
        // Wait one tick so the section body has unhidden before we scroll.
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      }
      return;
    }
    try {
      const stored = window.localStorage.getItem(`dp_section_${id}`);
      if (stored === '0') setOpen(false);
      else if (stored === '1') setOpen(true);
    } catch { /* localStorage may be blocked */ }
  }, [id]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(`dp_section_${id}`, next ? '1' : '0'); } catch { /* */ }
      return next;
    });
  }

  return (
    <section id={`dp-section-${id}`} className={`dp-section ${open ? 'is-open' : 'is-closed'}`}>
      <button type="button" className="dp-section-header" onClick={toggle} aria-expanded={open} aria-controls={`dp-section-body-${id}`}>
        <span className="dp-section-title">{title}</span>
        <span className="dp-section-chevron" aria-hidden="true">▾</span>
      </button>
      <div id={`dp-section-body-${id}`} className="dp-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

export default function DriverProfileClient({ profile, user, payout, subscription, market, marketAreas, cashAllowed }: Props) {
  const [data, setData] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [showVideoEditor, setShowVideoEditor] = useState(!profile.videoUrl);
  const [videoSaved, setVideoSaved] = useState(false);
  const [showVibeEditor, setShowVibeEditor] = useState(false);
  const [vibeSaved, setVibeSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const save = useCallback(async (patch: Partial<ProfileData>) => {
    setSaving(true);
    setSaved('');
    try {
      let res: Response;

      if ('acceptDirectBookings' in patch || 'minRiderChillScore' in patch || 'requireOgStatus' in patch || 'showVideoOnLink' in patch || 'profileVisible' in patch || 'fwu' in patch || 'acceptsCash' in patch || 'cashOnly' in patch || 'waitMinutes' in patch || 'advanceNoticeHours' in patch || 'allowInRouteStops' in patch) { // eslint-disable-line @typescript-eslint/no-unused-vars
        res = await fetch('/api/drivers/booking-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accept_direct_bookings: patch.acceptDirectBookings ?? data.acceptDirectBookings,
            min_rider_chill_score: patch.minRiderChillScore ?? data.minRiderChillScore,
            require_og_status: patch.requireOgStatus ?? data.requireOgStatus,
            show_video_on_link: patch.showVideoOnLink ?? data.showVideoOnLink,
            profile_visible: patch.profileVisible ?? data.profileVisible,
            fwu: patch.fwu ?? data.fwu,
            accepts_cash: patch.acceptsCash ?? data.acceptsCash,
            cash_only: patch.cashOnly ?? data.cashOnly,
            allow_in_route_stops: patch.allowInRouteStops ?? data.allowInRouteStops,
            wait_minutes: patch.waitMinutes ?? data.waitMinutes,
            advance_notice_hours: patch.advanceNoticeHours ?? data.advanceNoticeHours,
          }),
        });
      } else {
        // Map client field names to DB field names
        const apiPatch: Record<string, unknown> = {};
        if ('areaSlugs' in patch) apiPatch.area_slugs = patch.areaSlugs;
        if ('servicesEntireMarket' in patch) apiPatch.services_entire_market = patch.servicesEntireMarket;
        if ('acceptsLongDistance' in patch) apiPatch.accepts_long_distance = patch.acceptsLongDistance;
        if ('pricing' in patch) apiPatch.pricing = patch.pricing;
        if ('schedule' in patch) apiPatch.schedule = patch.schedule;
        if ('lgbtqFriendly' in patch) apiPatch.lgbtq_friendly = patch.lgbtqFriendly;
        if ('gender' in patch) apiPatch.gender = patch.gender;
        if ('pronouns' in patch) apiPatch.pronouns = patch.pronouns;

        res = await fetch('/api/users/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_type: 'driver', ...apiPatch }),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Save failed (${res.status})`);
      }

      setSaved('Saved');
      setTimeout(() => setSaved(''), 2500);
    } catch (err) {
      setSaved(err instanceof Error ? err.message : 'Error saving');
      setTimeout(() => setSaved(''), 4000);
    } finally {
      setSaving(false);
    }
  }, [data]);

  const update = (patch: Partial<ProfileData>) => {
    const next = { ...data, ...patch };
    setData(next);
    save(patch);
  };

  const toggleAreaSlug = (slug: string) => {
    const next = data.areaSlugs.includes(slug)
      ? data.areaSlugs.filter((s) => s !== slug)
      : [...data.areaSlugs, slug];
    update({ areaSlugs: next });
  };

  const toggleDay = (day: string) => {
    const sched = { ...data.schedule };
    const current = sched[day] as { available?: boolean } | undefined;
    sched[day] = { ...current, available: !(current?.available) };
    update({ schedule: sched });
  };

  const updatePricing = (key: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    update({ pricing: { ...data.pricing, [key]: num } });
  };

  const handleVideoSaved = async (url: string) => {
    // Upload API auto-saves video_url to driver_profiles
    setData((d) => ({ ...d, videoUrl: url }));
    setShowVideoEditor(false);
    setVideoSaved(true);
    setTimeout(() => setVideoSaved(false), 3000);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file');
      return;
    }

    setPhotoUploading(true);
    setUploadError('');
    setPhotoSaved(false);
    try {
      const formData = new FormData();
      formData.append('video', file, file.name);
      formData.append('profile_type', 'driver');
      formData.append('media_type', 'photo');

      const res = await fetch('/api/upload/video', { method: 'POST', body: formData });
      const result = await res.json();

      if (res.ok && result.url) {
        setData((d) => ({ ...d, vehiclePhotoUrl: result.url }));
        setPhotoSaved(true);
        setTimeout(() => setPhotoSaved(false), 4000);
      } else {
        setUploadError(result.error || 'Upload failed — try again');
      }
    } catch {
      setUploadError('Network error — check your connection and try again');
    } finally {
      setPhotoUploading(false);
      // Reset file input so same file can be re-selected
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const shareUrl = `atl.hmucashride.com/d/${data.handle}`;

  return (
    <>
      <style>{`
        :root { --green: #00E676; --black: #080808; --card: #141414; --card2: #1a1a1a; --border: rgba(255,255,255,0.08); --gray: #888; --gray-light: #bbb; }
        .dp { background: var(--black); color: #fff; min-height: 100svh; font-family: var(--font-body, 'DM Sans', sans-serif); padding: 72px 20px 40px; }
        .dp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .dp-title { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 32px; }
        .dp-back { font-size: 14px; color: var(--green); text-decoration: none; font-weight: 600; }
        .dp-stats { display: flex; gap: 12px; margin-bottom: 28px; }
        .dp-stat { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; flex: 1; text-align: center; }
        .dp-stat-val { font-family: var(--font-display, 'Bebas Neue', sans-serif); font-size: 28px; color: var(--green); }
        .dp-stat-label { font-size: 11px; color: var(--gray); text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
        .dp-section { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 18px 20px; margin-bottom: 14px; }
        .dp-section-header {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; background: transparent; border: none; padding: 0;
          cursor: pointer; color: #fff; text-align: left; gap: 12px;
          font-family: inherit;
        }
        .dp-section-header:focus-visible { outline: 2px solid var(--green); outline-offset: 4px; border-radius: 4px; }
        .dp-section-title {
          font-family: var(--font-display, 'Bebas Neue', sans-serif);
          font-size: 22px;
          color: #fff;
          letter-spacing: 1px;
          text-transform: uppercase;
          line-height: 1;
          flex: 1;
        }
        .dp-section-chevron {
          color: var(--green); font-size: 14px; transition: transform 0.2s ease;
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 999px;
          background: rgba(0,230,118,0.08);
        }
        .dp-section.is-closed .dp-section-chevron { transform: rotate(-90deg); }
        .dp-section.is-open .dp-section-body { margin-top: 14px; }
        .dp-section-body[hidden] { display: none; }
        .dp-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .dp-row:last-child { border-bottom: none; }
        .dp-row-left { flex: 1; padding-right: 12px; }
        .dp-row-label { font-size: 15px; font-weight: 600; }
        .dp-row-sub { font-size: 12px; color: var(--gray); margin-top: 2px; line-height: 1.4; }
        .dp-row-value { font-size: 14px; color: var(--gray-light); }
        .toggle { width: 48px; height: 28px; border-radius: 100px; border: none; cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
        .toggle.on { background: var(--green); }
        .toggle.off { background: #2a2a2a; }
        .toggle-thumb { position: absolute; top: 4px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: left 0.2s; }
        .toggle.on .toggle-thumb { left: 24px; }
        .toggle.off .toggle-thumb { left: 4px; }
        .score-input { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: #fff; font-size: 14px; width: 70px; text-align: center; outline: none; font-family: var(--font-mono, monospace); }
        .score-input:focus { border-color: var(--green); }
        .price-input { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 12px; color: var(--green); font-size: 16px; width: 80px; text-align: center; outline: none; font-family: var(--font-display, 'Bebas Neue', sans-serif); }
        .price-input:focus { border-color: var(--green); }
        .area-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .area-chip { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 14px; font-size: 13px; color: var(--gray-light); cursor: pointer; transition: all 0.15s; }
        .area-chip.selected { background: rgba(0,230,118,0.12); border-color: rgba(0,230,118,0.3); color: var(--green); }
        .day-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .day-btn { background: #1f1f1f; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 4px; text-align: center; cursor: pointer; transition: all 0.15s; }
        .day-btn.active { background: rgba(0,230,118,0.1); border-color: rgba(0,230,118,0.3); }
        .day-btn-label { font-size: 10px; color: var(--gray); text-transform: uppercase; letter-spacing: 1px; }
        .day-btn-dot { width: 6px; height: 6px; border-radius: 50%; background: #333; margin: 6px auto 0; }
        .day-btn.active .day-btn-dot { background: var(--green); }
        .save-status { font-size: 12px; color: var(--green); text-align: right; min-height: 18px; margin-top: 4px; }
        .link-pill { background: var(--card2); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; font-family: var(--font-mono, monospace); font-size: 13px; color: var(--green); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 12px; }
        .badge { display: inline-block; background: var(--green); color: var(--black); font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 100px; letter-spacing: 1px; text-transform: uppercase; margin-left: 8px; }

        /* Video section */
        .media-saved { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; background: rgba(0,230,118,0.1); border: 1px solid rgba(0,230,118,0.25); border-radius: 12px; color: var(--green); font-size: 14px; font-weight: 600; margin-bottom: 12px; }
        .media-preview { position: relative; border-radius: 16px; overflow: hidden; margin-bottom: 12px; }
        .media-preview video, .media-preview img { width: 100%; aspect-ratio: 9/16; max-height: 280px; object-fit: contain; border-radius: 16px; background: #000; display: block; }
        .media-actions { display: flex; gap: 8px; }
        .media-btn { flex: 1; padding: 12px; border-radius: 100px; font-size: 14px; font-weight: 600; cursor: pointer; text-align: center; font-family: var(--font-body, 'DM Sans', sans-serif); transition: all 0.15s; }
        .media-btn:hover { transform: scale(1.02); }
        .media-btn--outline { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #fff; }
        .media-btn--green { background: var(--green); border: none; color: var(--black); }
        .media-btn--red { background: transparent; border: 1px solid rgba(255,80,80,0.3); color: #FF5252; }

        /* Dark theme overrides for VideoRecorder */
        .video-editor-wrap { color: #fff; }
        .video-editor-wrap .text-muted-foreground { color: var(--gray) !important; }
        .video-editor-wrap button[class*="border-purple"] { border-color: var(--green) !important; background: rgba(0,230,118,0.08) !important; }
        .video-editor-wrap button[class*="border-purple"] div[class*="bg-purple"] { background: var(--green) !important; }
        .video-editor-wrap button[class*="border-gray"], .video-editor-wrap button[class*="border-2 border-gray"] { border-color: rgba(255,255,255,0.15) !important; background: var(--card2) !important; }
        .video-editor-wrap div[class*="bg-gray-200"] { background: #333 !important; color: var(--gray-light) !important; }
        .video-editor-wrap div[class*="bg-amber-50"] { background: rgba(255,179,0,0.08) !important; border-color: rgba(255,179,0,0.2) !important; }
        .video-editor-wrap p[class*="text-amber-800"] { color: #FFB300 !important; }
        .video-editor-wrap p[class*="text-amber-700"] { color: #FFA000 !important; }
        .video-editor-wrap div[class*="border-dashed"] { border-color: rgba(255,255,255,0.15) !important; background: var(--card2) !important; }
        .video-editor-wrap label[class*="from-purple"] { background: var(--green) !important; color: var(--black) !important; }
        .video-editor-wrap button[class*="from-red"] { background: var(--green) !important; }
        .video-editor-wrap button[class*="from-green"] { background: var(--green) !important; color: var(--black) !important; }
        .video-editor-wrap div[class*="bg-red-50"] { background: rgba(255,68,68,0.1) !important; color: #FF5252 !important; }
        .video-editor-wrap button[class*="border-gray-300"] { border-color: rgba(255,255,255,0.15) !important; color: var(--gray-light) !important; }
        .video-editor-wrap button[class*="border-gray-300"]:hover { background: rgba(255,255,255,0.05) !important; }

        /* Photo section */
        .photo-upload-zone { border: 2px dashed rgba(255,255,255,0.12); border-radius: 16px; padding: 32px 20px; text-align: center; cursor: pointer; transition: all 0.15s; }
        .photo-upload-zone:hover { border-color: rgba(0,230,118,0.3); background: rgba(0,230,118,0.03); }
        .photo-upload-icon { font-size: 36px; margin-bottom: 8px; opacity: 0.5; }
        .photo-upload-text { font-size: 14px; color: var(--gray-light); font-weight: 500; }
        .photo-upload-sub { font-size: 12px; color: var(--gray); margin-top: 4px; }
        .save-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--green); color: var(--black); font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 100px; z-index: 60; animation: toastIn 0.3s ease-out; box-shadow: 0 4px 20px rgba(0,230,118,0.3); }
        .save-toast--error { background: #FF5252; color: #fff; box-shadow: 0 4px 20px rgba(255,82,82,0.3); }
        .save-toast--saving { background: var(--card2); border: 1px solid var(--border); color: var(--green); }
        @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(16px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>

      <div className="dp">
        <DealPill />
        <div className="dp-header">
          <h1 className="dp-title">
            {data.displayName}
            {user.tier === 'hmu_first' && <span className="badge">{'\uD83E\uDD47'} HMU 1st</span>}
          </h1>
          <Link href="/driver/home" className="dp-back">Back</Link>
        </div>

        {/* Stats */}
        <div className="dp-stats">
          <div className="dp-stat">
            <div className="dp-stat-val">{user.chillScore.toFixed(0)}%</div>
            <div className="dp-stat-label">Chill Score</div>
          </div>
          <div className="dp-stat">
            <div className="dp-stat-val">{user.completedRides}</div>
            <div className="dp-stat-label">Rides</div>
          </div>
          <div className="dp-stat">
            <div className="dp-stat-val">{user.tier === 'hmu_first' ? '12%' : '10-25%'}</div>
            <div className="dp-stat-label">Fee Rate</div>
          </div>
        </div>

        {/* Share Link */}
        <Section id="hmu-link" title="Your HMU Link">
          <div className="link-pill">{shareUrl}</div>
        </Section>

        {/* Payout */}
        <PayoutSection
          payoutSetupComplete={payout.setupComplete}
          last4={payout.last4}
          accountType={payout.accountType}
          bankName={payout.bankName}
          tier={user.tier}
        />

        {/* Linked Payment Method */}
        <PaymentMethodSection />

        {/* HMU First Subscription */}
        {user.tier === 'hmu_first' && (
          <Section id="subscription" title="HMU First Subscription">
            <div className="dp-row">
              <div className="dp-row-left">
                <div className="dp-row-label">Status</div>
                <div className="dp-row-sub">$9.99/mo — active</div>
              </div>
              <span style={{
                background: '#00E676', color: '#080808', fontSize: 10, fontWeight: 800,
                padding: '4px 12px', borderRadius: 100, letterSpacing: 1, textTransform: 'uppercase',
              }}>
                Active
              </span>
            </div>
            {subscription.subscriptionId && (
              <div className="dp-row">
                <div className="dp-row-left">
                  <div className="dp-row-label">Subscription ID</div>
                  <div className="dp-row-sub" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontSize: 11 }}>
                    {subscription.subscriptionId.slice(0, 20)}...
                  </div>
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Booking Settings */}
        <Section id="booking" title="Booking Settings">

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Accept direct bookings</div>
              <div className="dp-row-sub">Riders with your link can request you</div>
            </div>
            <button
              className={`toggle ${data.acceptDirectBookings ? 'on' : 'off'}`}
              onClick={() => update({ acceptDirectBookings: !data.acceptDirectBookings })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Min Chill Score</div>
              <div className="dp-row-sub">Only riders at or above this score</div>
            </div>
            <input
              type="number"
              className="score-input"
              value={data.minRiderChillScore}
              min={0}
              max={100}
              onChange={(e) => setData((d) => ({ ...d, minRiderChillScore: Number(e.target.value) }))}
              onBlur={(e) => update({ minRiderChillScore: Math.min(100, Math.max(0, Number(e.target.value))) })}
            />
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">OG Riders only</div>
              <div className="dp-row-sub">Require 10+ rides, zero disputes</div>
            </div>
            <button
              className={`toggle ${data.requireOgStatus ? 'on' : 'off'}`}
              onClick={() => update({ requireOgStatus: !data.requireOgStatus })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">FWU</div>
              <div className="dp-row-sub">Signal you might accept less than your minimum</div>
            </div>
            <button
              className={`toggle ${data.fwu ? 'on' : 'off'}`}
              onClick={() => update({ fwu: !data.fwu })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          {cashAllowed && (
            <div className="dp-row">
              <div className="dp-row-left">
                <div className="dp-row-label">Accepts Cash</div>
                <div className="dp-row-sub">Show riders you take cash payments</div>
              </div>
              <button
                className={`toggle ${data.acceptsCash ? 'on' : 'off'}`}
                onClick={() => {
                  const newVal = !data.acceptsCash;
                  update({ acceptsCash: newVal, ...(newVal ? {} : { cashOnly: false }) });
                }}
              >
                <div className="toggle-thumb" />
              </button>
            </div>
          )}

          {cashAllowed && data.acceptsCash && (
            <div className="dp-row">
              <div className="dp-row-left">
                <div className="dp-row-label">Cash Only</div>
                <div className="dp-row-sub">
                  {data.cashOnly && !payout.setupComplete
                    ? 'Link a payout account to accept digital rides'
                    : 'Only show cash ride requests — no digital payments'}
                </div>
              </div>
              <button
                className={`toggle ${data.cashOnly ? 'on' : 'off'}`}
                onClick={() => {
                  if (data.cashOnly && !payout.setupComplete) {
                    // Must set up payout before accepting digital rides
                    window.location.href = '/driver/payout-setup';
                    return;
                  }
                  update({ cashOnly: !data.cashOnly });
                }}
              >
                <div className="toggle-thumb" />
              </button>
            </div>
          )}
          {cashAllowed && data.cashOnly && !payout.setupComplete && (
            <div style={{ padding: '0 16px 12px', fontSize: 12, color: '#FFC107' }}>
              💡 Set up your payout account to accept digital rides and earn more
            </div>
          )}
          {cashAllowed && !data.cashOnly && payout.setupComplete && (
            <div style={{ padding: '0 16px 12px', fontSize: 12, color: '#888' }}>
              Stripe typically enables same-day payouts 1-2 days after your first digital ride
            </div>
          )}
          {!cashAllowed && (
            <div className="dp-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div className="dp-row-label">Payment</div>
              <div className="dp-row-sub">
                Every ride authorizes a digital deposit; the rest is collected in cash on arrival. Cash-only rides aren&apos;t available under the current pricing model.
              </div>
            </div>
          )}

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">In-Route Stops</div>
              <div className="dp-row-sub">Allow riders to add stops during the ride</div>
            </div>
            <button
              className={`toggle ${data.allowInRouteStops ? 'on' : 'off'}`}
              onClick={() => update({ allowInRouteStops: !data.allowInRouteStops })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Wait Time</div>
              <div className="dp-row-sub">Minutes you&apos;ll wait at pickup before you can leave</div>
            </div>
            <select
              value={data.waitMinutes}
              onChange={(e) => update({ waitMinutes: Number(e.target.value) })}
              className="score-input"
              style={{ width: 70 }}
            >
              {[5, 7, 10, 15, 20].map(m => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Advance Notice</div>
              <div className="dp-row-sub">How far ahead riders need to book. 0 = no notice needed.</div>
            </div>
            <select
              value={data.advanceNoticeHours}
              onChange={(e) => update({ advanceNoticeHours: Number(e.target.value) })}
              className="score-input"
              style={{ width: 70 }}
            >
              {[0, 1, 2, 3, 4, 6, 8, 12, 24].map(h => (
                <option key={h} value={h}>{h === 0 ? 'None' : `${h}hr`}</option>
              ))}
            </select>
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">LGBTQ+ friendly</div>
              <div className="dp-row-sub">Show badge on your profile</div>
            </div>
            <button
              className={`toggle ${data.lgbtqFriendly ? 'on' : 'off'}`}
              onClick={() => update({ lgbtqFriendly: !data.lgbtqFriendly })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="save-status">{saving ? 'Saving...' : saved}</div>
        </Section>

        {/* Safety Check-ins — user-configurable opt-out + interval */}
        <SafetySettings />

        {/* Visibility */}
        <Section id="visibility" title="Visibility">

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Profile visible</div>
              <div className="dp-row-sub">Turn off when you&apos;re not doing rides — hides you from the app</div>
            </div>
            <button
              className={`toggle ${data.profileVisible ? 'on' : 'off'}`}
              onClick={() => update({ profileVisible: !data.profileVisible })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Show video on HMU link</div>
              <div className="dp-row-sub">Toggle off to show your photo instead — video stays saved</div>
            </div>
            <button
              className={`toggle ${data.showVideoOnLink ? 'on' : 'off'}`}
              onClick={() => update({ showVideoOnLink: !data.showVideoOnLink })}
            >
              <div className="toggle-thumb" />
            </button>
          </div>
        </Section>

        {/* Pricing */}
        <Section id="pricing" title="Pricing">
          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Minimum ride</div>
              <div className="dp-row-sub">Don&apos;t HMU for less than this</div>
            </div>
            <input type="number" className="price-input" defaultValue={Number(data.pricing.minimum ?? 0)} onBlur={(e) => updatePricing('minimum', e.target.value)} placeholder="$" />
          </div>
          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">30 min ride</div>
              <div className="dp-row-sub">Short trips around your area</div>
            </div>
            <input type="number" className="price-input" defaultValue={Number(data.pricing.base_rate ?? 0)} onBlur={(e) => updatePricing('base_rate', e.target.value)} placeholder="$" />
          </div>
          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">1 hour</div>
              <div className="dp-row-sub">Multi-stop or longer distance</div>
            </div>
            <input type="number" className="price-input" defaultValue={Number(data.pricing.hourly ?? 0)} onBlur={(e) => updatePricing('hourly', e.target.value)} placeholder="$" />
          </div>
          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Out of town / hr</div>
              <div className="dp-row-sub">Outside your usual areas</div>
            </div>
            <input type="number" className="price-input" defaultValue={Number(data.pricing.out_of_town ?? 0)} onBlur={(e) => updatePricing('out_of_town', e.target.value)} placeholder="$" />
          </div>
          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Deposit floor</div>
              <div className="dp-row-sub">Minimum deposit you require to start a ride. Rest is collected in cash on arrival. Leave blank to use the platform default.</div>
            </div>
            <input
              type="number"
              className="price-input"
              defaultValue={data.depositFloor ?? ''}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                const num = raw === '' ? null : parseFloat(raw);
                if (raw !== '' && (Number.isNaN(num) || (num as number) < 0)) return;
                setData((d) => ({ ...d, depositFloor: num }));
                fetch('/api/drivers/booking-settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ deposit_floor: num }),
                });
                setSaved('Deposit floor saved');
                setTimeout(() => setSaved(''), 2000);
              }}
              placeholder="$"
              min={0}
              step={1}
            />
          </div>
          <div className="save-status">{saving ? 'Saving...' : saved}</div>
        </Section>

        {/* Areas */}
        <Section id="areas" title={`Areas You Serve — ${market.name}`}>
          <div className="dp-row-sub" style={{ marginBottom: '12px' }}>
            Tap to toggle. Riders pick from the same list — you&apos;ll get matched when there&apos;s overlap.
          </div>

          {/* Macro toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            <label className="dp-row" style={{ cursor: 'pointer' }}>
              <div className="dp-row-left">
                <div className="dp-row-label">Anywhere in {market.name}</div>
                <div className="dp-row-sub">Show me every request in this market — no area filter</div>
              </div>
              <input
                type="checkbox"
                checked={data.servicesEntireMarket}
                onChange={(e) => update({ servicesEntireMarket: e.target.checked })}
              />
            </label>
            <label className="dp-row" style={{ cursor: 'pointer' }}>
              <div className="dp-row-left">
                <div className="dp-row-label">Long distance OK</div>
                <div className="dp-row-sub">Accept rides where the dropoff is outside {market.name}</div>
              </div>
              <input
                type="checkbox"
                checked={data.acceptsLongDistance}
                onChange={(e) => update({ acceptsLongDistance: e.target.checked })}
              />
            </label>
          </div>

          {!data.servicesEntireMarket && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CARDINAL_ORDER.map(cardinal => {
                const rows = marketAreas.filter(a => a.cardinal === cardinal);
                if (!rows.length) return null;
                return (
                  <div key={cardinal}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>
                      {CARDINAL_LABEL[cardinal]}
                    </div>
                    <div className="area-chips">
                      {rows.map(a => (
                        <button
                          key={a.slug}
                          className={`area-chip${data.areaSlugs.includes(a.slug) ? ' selected' : ''}`}
                          onClick={() => toggleAreaSlug(a.slug)}
                        >
                          {a.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Home base — where the driver usually drives from. Surfaced on
            rider discovery cards so they see a driver's base even when the
            driver is offline. Optional — driving works without it. */}
        <Section id="home_area" title="Where You Drive From">
          <HomeAreaEditor
            initial={{
              homeLat: data.homeLat,
              homeLng: data.homeLng,
              homeLabel: data.homeLabel,
              homeMapboxId: data.homeMapboxId,
            }}
            onChange={(next) =>
              setData((d) => ({
                ...d,
                homeLat: next.homeLat,
                homeLng: next.homeLng,
                homeLabel: next.homeLabel,
                homeMapboxId: next.homeMapboxId,
              }))
            }
          />
        </Section>

        {/* Schedule */}
        <Section id="availability" title="Availability">
          <div className="dp-row-sub" style={{ marginBottom: '12px' }}>Days you&apos;re available — shows on your HMU link</div>
          <div className="day-grid">
            {DAYS.map((day) => {
              const isActive = (data.schedule[day] as { available?: boolean } | undefined)?.available ?? false;
              return (
                <button key={day} className={`day-btn${isActive ? ' active' : ''}`} onClick={() => toggleDay(day)}>
                  <div className="day-btn-label">{DAY_LABELS[day]}</div>
                  <div className="day-btn-dot" />
                </button>
              );
            })}
          </div>
        </Section>

        {/* Video Intro */}
        <Section id="video" title="Video Intro">
          <p className="dp-row-sub" style={{ marginBottom: '14px' }}>
            Plays on your HMU link so riders know who&apos;s pulling up
          </p>

          {videoSaved && (
            <div className="media-saved">Saved — your video is live on your HMU link</div>
          )}

          {data.videoUrl && !showVideoEditor ? (
            <>
              <div className="media-preview">
                <video
                  src={data.videoUrl}
                  controls
                  playsInline
                  autoPlay
                  muted
                  loop
                  preload="metadata"
                  style={{ borderRadius: '12px' }}
                />
              </div>
              <div className="media-actions">
                <button className="media-btn media-btn--outline" onClick={() => setShowVideoEditor(true)}>
                  Record New
                </button>
                <button className="media-btn media-btn--outline" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'video/*';
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const formData = new FormData();
                    formData.append('video', file);
                    formData.append('profile_type', 'driver');
                    formData.append('media_type', 'video');
                    formData.append('save_to_profile', 'true');
                    try {
                      const res = await fetch('/api/upload/video', { method: 'POST', body: formData });
                      const data = await res.json();
                      if (res.ok && data.url) handleVideoSaved(data.url);
                    } catch { /* silent */ }
                  };
                  input.click();
                }}>
                  Upload New
                </button>
              </div>
            </>
          ) : (
            <div className="video-editor-wrap">
              <VideoRecorder
                key={showVideoEditor ? 'editing' : 'initial'}
                onVideoRecorded={(url) => handleVideoSaved(url)}
                existingVideoUrl={undefined}
                profileType="driver"
              />
              {data.videoUrl && (
                <button
                  className="media-btn media-btn--outline"
                  style={{ width: '100%', marginTop: '10px' }}
                  onClick={() => setShowVideoEditor(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Vibe on File */}
        <Section id="vibe" title="Vibe on File" defaultOpen={false}>
          <p className="dp-row-sub" style={{ marginBottom: '14px' }}>
            Quick selfie video so riders know your vibe. Shows a &quot;Vibe on File&quot; badge on your card.
          </p>

          {vibeSaved && (
            <div className="media-saved">Vibe saved — badge is now visible on your card</div>
          )}

          {data.vibeVideoUrl && !showVibeEditor ? (
            <>
              <div className="media-preview">
                <video
                  src={data.vibeVideoUrl}
                  controls
                  playsInline
                  autoPlay
                  muted
                  loop
                  preload="metadata"
                  style={{ borderRadius: '12px' }}
                />
              </div>
              <div className="media-actions">
                <button className="media-btn media-btn--outline" onClick={() => setShowVibeEditor(true)}>
                  Re-record Vibe
                </button>
              </div>
            </>
          ) : (
            <div className="video-editor-wrap">
              <VideoRecorder
                key={showVibeEditor ? 'vibe-editing' : 'vibe-initial'}
                onVideoRecorded={(url) => {
                  setData((d) => ({ ...d, vibeVideoUrl: url }));
                  setShowVibeEditor(false);
                  setVibeSaved(true);
                  setTimeout(() => setVibeSaved(false), 3000);
                }}
                existingVideoUrl={undefined}
                profileType="driver"
                mediaType="vibe"
                maxDuration={6000}
                onUploadStateChange={() => {}}
              />
              {data.vibeVideoUrl && (
                <button
                  className="media-btn media-btn--outline"
                  style={{ width: '100%', marginTop: '10px' }}
                  onClick={() => setShowVibeEditor(false)}
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Cover Photo / Ad */}
        <Section id="photo" title="Cover Photo / Ad">
          <p className="dp-row-sub" style={{ marginBottom: '14px' }}>
            Shows on your HMU link — use a vehicle photo, promo flyer, or ad
          </p>

          {photoSaved && (
            <div className="media-saved">Photo saved — visible on your HMU link now</div>
          )}
          {uploadError && (
            <div style={{ padding: '12px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: '12px', color: '#FF5252', fontSize: '14px', marginBottom: '12px' }}>
              {uploadError}
            </div>
          )}

          {data.vehiclePhotoUrl ? (
            <>
              <div className="media-preview">
                <img src={data.vehiclePhotoUrl} alt="Cover" style={{ aspectRatio: '4/3' }} />
              </div>
              <div className="media-actions">
                <button
                  className="media-btn media-btn--outline"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                >
                  {photoUploading ? 'Uploading...' : 'Change Photo'}
                </button>
              </div>
            </>
          ) : (
            <div className="photo-upload-zone" onClick={() => photoInputRef.current?.click()}>
              <div className="photo-upload-icon">{'\uD83D\uDCF7'}</div>
              <div className="photo-upload-text">
                {photoUploading ? 'Uploading...' : 'Tap to upload a photo'}
              </div>
              <div className="photo-upload-sub">
                Vehicle photo, promo card, or advertisement
              </div>
            </div>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />
        </Section>

        {/* Phone Number — required for booking notifications */}
        <Section id="phone" title="Phone Number">
          {!data.phone && (
            <div style={{
              background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.25)',
              borderRadius: 12, padding: '10px 14px', marginBottom: 10,
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <span style={{ fontSize: 16 }}>&#9888;&#65039;</span>
              <span style={{ fontSize: 12, color: '#FF8A80', lineHeight: 1.4 }}>
                <strong style={{ color: '#fff' }}>No phone number.</strong> You won&apos;t receive SMS when riders book you.
              </span>
            </div>
          )}
          <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
            We text you when a rider books, your ride status changes, or anything urgent. Never shared with riders.
          </div>
          <input
            type="tel"
            value={data.phone}
            onChange={(e) => setData(d => ({ ...d, phone: e.target.value }))}
            onBlur={() => {
              const cleaned = data.phone.replace(/[^\d+]/g, '');
              if (cleaned && cleaned !== profile.phone) {
                // Normalize: ensure +1 prefix for US numbers
                const normalized = cleaned.startsWith('+') ? cleaned : cleaned.length === 10 ? `+1${cleaned}` : `+${cleaned}`;
                setData(d => ({ ...d, phone: normalized }));
                fetch('/api/drivers/booking-settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ phone: normalized }),
                });
                setSaved('Phone saved');
                setTimeout(() => setSaved(''), 2000);
              }
            }}
            placeholder="(404) 555-1234"
            style={{
              width: '100%', background: '#1a1a1a', border: `1px solid ${data.phone ? 'rgba(255,255,255,0.1)' : 'rgba(255,82,82,0.3)'}`,
              borderRadius: 12, padding: '12px 14px', color: '#fff', fontSize: 16,
              fontFamily: "var(--font-mono, 'Space Mono', monospace)",
              letterSpacing: 1, outline: 'none',
            }}
          />
          {data.phone && (
            <div style={{ fontSize: 11, color: '#00E676', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>&#10003;</span> Booking notifications will be sent here
            </div>
          )}
        </Section>

        {/* License Plate */}
        <Section id="vehicle" title="License Plate">
          <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
            Riders see this when you&apos;re close. Update anytime if you switch cars.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={data.licensePlate}
              onChange={(e) => setData(d => ({ ...d, licensePlate: e.target.value.toUpperCase() }))}
              onBlur={() => {
                if (data.licensePlate !== profile.licensePlate) {
                  fetch('/api/drivers/booking-settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ license_plate: data.licensePlate, plate_state: data.plateState }),
                  });
                  setSaved('Plate saved');
                  setTimeout(() => setSaved(''), 2000);
                }
              }}
              placeholder="ABC 1234"
              maxLength={10}
              style={{
                flex: 1, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '12px 14px', color: '#fff', fontSize: 16,
                fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                letterSpacing: 3, textTransform: 'uppercase', outline: 'none',
              }}
            />
            <select
              value={data.plateState}
              onChange={(e) => {
                setData(d => ({ ...d, plateState: e.target.value }));
                fetch('/api/drivers/booking-settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ license_plate: data.licensePlate, plate_state: e.target.value }),
                });
              }}
              style={{
                width: 70, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '12px 8px', color: '#fff', fontSize: 14,
                outline: 'none',
              }}
            >
              {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </Section>

        {/* Display Identity */}
        <Section id="identity" title="Public Identity">
          <div className="dp-row-sub" style={{ marginBottom: '12px' }}>What riders see on your profile and HMU link</div>
          <div className="dp-row">
            <div className="dp-row-left">
              <div className="dp-row-label">Driver Name</div>
              <div className="dp-row-sub">Change anytime — your link stays the same</div>
            </div>
            <div className="dp-row-value">{data.displayName}</div>
          </div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Handle</div></div>
            <div className="dp-row-value">@{data.handle}</div>
          </div>
        </Section>

        {/* Legal Identity */}
        <Section id="legal" title="Legal Identity">
          <div className="dp-row-sub" style={{ marginBottom: '12px' }}>Private — used for Stripe verification &amp; payouts only. Riders never see this.</div>
          <div className="dp-row">
            <div className="dp-row-left"><div className="dp-row-label">Legal Name</div></div>
            <div className="dp-row-value">
              {data.firstName || data.lastName
                ? `${data.firstName} ${data.lastName}`
                : <Link href="/driver/payout-setup" style={{ color: '#00E676', textDecoration: 'none' }}>Add at payout setup &rarr;</Link>}
            </div>
          </div>

          <div className="dp-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div className="dp-row-left" style={{ width: '100%', padding: 0 }}>
              <div className="dp-row-label">Gender</div>
              <div className="dp-row-sub">Helps riders match with drivers they feel comfortable with</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { v: 'woman', l: 'Woman', i: '\u2640\ufe0f' },
                { v: 'man', l: 'Man', i: '\u2642\ufe0f' },
                { v: 'non-binary', l: 'Non-binary', i: '\u26a7\ufe0f' },
                { v: 'prefer-not-to-say', l: 'Prefer not to say', i: '\ud83d\udc64' },
              ].map(opt => {
                const active = data.gender === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => update({ gender: opt.v })}
                    className={`area-chip${active ? ' selected' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', justifyContent: 'flex-start' }}
                  >
                    <span style={{ fontSize: 18 }}>{opt.i}</span>
                    <span>{opt.l}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dp-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div className="dp-row-left" style={{ width: '100%', padding: 0 }}>
              <div className="dp-row-label">Pronouns</div>
              <div className="dp-row-sub">Free text \u2014 e.g. she/her, he/him, they/them</div>
            </div>
            <input
              type="text"
              value={data.pronouns}
              onChange={(e) => setData(d => ({ ...d, pronouns: e.target.value }))}
              onBlur={(e) => { if (e.target.value !== profile.pronouns) update({ pronouns: e.target.value }); }}
              placeholder="she/her"
              style={{
                width: '100%',
                background: '#1a1a1a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '12px 14px',
                color: '#fff',
                fontSize: 16,
                outline: 'none',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            />
          </div>
          <div className="save-status">{saving ? 'Saving...' : saved}</div>
        </Section>
      </div>

      {/* Save toast */}
      {saving && <div className="save-toast save-toast--saving">Saving...</div>}
      {!saving && saved && (
        <div className={`save-toast${saved.includes('Error') || saved.includes('failed') ? ' save-toast--error' : ''}`}>
          {saved}
        </div>
      )}
    </>
  );
}

function PaymentMethodSection() {
  const [hasMethod, setHasMethod] = useState<boolean | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [last4, setLast4] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/driver/payment-setup')
      .then(r => r.json())
      .then(data => {
        setHasMethod(data.hasPaymentMethod || false);
        setBrand(data.brand || null);
        setLast4(data.last4 || null);
      })
      .catch(() => setHasMethod(false))
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = () => {
    setShowForm(false);
    fetch('/api/driver/payment-setup')
      .then(r => r.json())
      .then(data => {
        setHasMethod(true);
        setBrand(data.brand || null);
        setLast4(data.last4 || null);
      })
      .catch(() => {});
  };

  return (
    <Section id="payment" title="Payment Method">

      {loading ? (
        <div style={{ fontSize: 13, color: '#888', padding: '12px 0' }}>Checking...</div>
      ) : hasMethod && !showForm ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{'\uD83D\uDCB3'}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
                  {(brand || 'Card').charAt(0).toUpperCase() + (brand || 'card').slice(1)} ending in {last4}
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>Used for HMU First &amp; Cash Packs</div>
              </div>
            </div>
            <span style={{ color: '#00E676', fontSize: 16 }}>{'\u2713'}</span>
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{
              display: 'block', width: '100%', marginTop: 8,
              textAlign: 'center', fontSize: 13, color: '#00E676', fontWeight: 600,
              padding: 10, border: '1px solid rgba(0,230,118,0.2)', borderRadius: 100,
              background: 'transparent', cursor: 'pointer',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            Update card
          </button>
        </>
      ) : (
        <>
          {!showForm && (
            <div style={{ fontSize: 13, color: '#FFB300', marginBottom: 12, lineHeight: 1.4 }}>
              Link a card for one-tap HMU First upgrades and Cash Pack purchases.
            </div>
          )}
          <DriverPaymentForm onSuccess={handleSaved} />
          {showForm && (
            <button
              onClick={() => setShowForm(false)}
              style={{
                display: 'block', width: '100%', marginTop: 8,
                textAlign: 'center', fontSize: 13, color: '#888',
                padding: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 100,
                background: 'transparent', cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Cancel
            </button>
          )}
        </>
      )}
    </Section>
  );
}

// ─── Home base editor ───────────────────────────────────────────────────────
// AddressAutocomplete + saved-state pill + clear button. Persists to
// /api/drivers/home-area; optimistic UI (per the frontend feel-bar rule —
// no blank state during the save round-trip).

interface HomeAreaState {
  homeLat: number | null;
  homeLng: number | null;
  homeLabel: string | null;
  homeMapboxId: string | null;
}

function HomeAreaEditor({
  initial,
  onChange,
}: {
  initial: HomeAreaState;
  onChange: (next: HomeAreaState) => void;
}) {
  const [state, setState] = useState<HomeAreaState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const hasHome = state.homeLat != null && state.homeLng != null;

  const handleSelect = async (addr: ValidatedAddress) => {
    setError(null);
    const next: HomeAreaState = {
      homeLat: addr.latitude,
      homeLng: addr.longitude,
      homeLabel: addr.address || addr.name,
      homeMapboxId: addr.mapbox_id,
    };
    // Optimistic — show the saved state immediately while the request flies.
    setState(next);
    onChange(next);
    setEditing(false);
    setSaving(true);
    try {
      const res = await fetch('/api/drivers/home-area', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: addr.latitude,
          lng: addr.longitude,
          label: next.homeLabel,
          mapbox_id: addr.mapbox_id,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error || 'Could not save home base');
        setState(initial);
        onChange(initial);
      } else {
        try {
          posthog.capture('driver_home_area_set', { source: 'profile' });
        } catch { /* ignore */ }
      }
    } catch {
      setError('Network error — try again');
      setState(initial);
      onChange(initial);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear your home base?')) return;
    setError(null);
    const cleared: HomeAreaState = {
      homeLat: null,
      homeLng: null,
      homeLabel: null,
      homeMapboxId: null,
    };
    setState(cleared);
    onChange(cleared);
    setSaving(true);
    try {
      const res = await fetch('/api/drivers/home-area', { method: 'DELETE' });
      if (!res.ok) {
        setError('Could not clear home base');
        setState(initial);
        onChange(initial);
      } else {
        try {
          posthog.capture('driver_home_area_cleared', { source: 'profile' });
        } catch { /* ignore */ }
      }
    } catch {
      setError('Network error — try again');
      setState(initial);
      onChange(initial);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="dp-row-sub" style={{ marginBottom: 12 }}>
        Drop a pin where you usually drive from. Riders see this as &ldquo;
        <em>X mi away</em>&rdquo; on your card — even when you&rsquo;re offline.
        Optional, and you can clear it anytime.
      </div>

      {hasHome && !editing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid rgba(0,230,118,0.3)',
            background: 'rgba(0,230,118,0.06)',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: 1.4, color: '#00E676', textTransform: 'uppercase', marginBottom: 3 }}>
              Home base set
            </div>
            <div style={{ fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.homeLabel || 'Saved location'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={saving}
              style={{
                fontSize: 12, padding: '6px 12px', borderRadius: 100,
                border: '1px solid rgba(255,255,255,0.18)', background: 'transparent',
                color: '#fff', cursor: saving ? 'default' : 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Change
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              style={{
                fontSize: 12, padding: '6px 12px', borderRadius: 100,
                border: '1px solid rgba(255,138,138,0.4)', background: 'transparent',
                color: '#FF8A8A', cursor: saving ? 'default' : 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {(!hasHome || editing) && (
        <div>
          <AddressAutocomplete
            label="Home base"
            placeholder="Search a neighborhood, intersection, or address"
            onSelect={handleSelect}
            proximity={
              state.homeLat != null && state.homeLng != null
                ? { lat: state.homeLat, lng: state.homeLng }
                : undefined
            }
          />
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                display: 'block', width: '100%', marginTop: 10,
                textAlign: 'center', fontSize: 13, color: '#888',
                padding: 10, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 100,
                background: 'transparent', cursor: 'pointer',
                fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {saving && (
        <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>Saving…</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: '#FF8A8A', marginTop: 8 }}>{error}</div>
      )}
    </div>
  );
}
