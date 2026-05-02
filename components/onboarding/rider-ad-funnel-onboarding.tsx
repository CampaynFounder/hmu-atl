'use client';

// Rider ad-funnel onboarding — the variant linked from paid Meta/TikTok ads.
// Optimised for conversion: minimum fields, fast, payment deferred to first
// driver-tap on /rider/browse.
//
// Distinct from:
//   - rider-onboarding.tsx          (organic signup, fuller intake)
//   - express-rider-onboarding.tsx  (chat-funnel from /d/{handle} share link)
//   - driver-onboarding-express.tsx (driver ad-funnel)
//
// Driven by platform_config 'onboarding.rider_ad_funnel' via
// lib/onboarding/rider-ad-funnel-config.ts.

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import { fbEvent, fbCustomEvent } from '@/components/analytics/meta-pixel';
import { LocationPermission } from './location-permission';
import { VideoRecorder } from './video-recorder';
import CelebrationConfetti from '@/components/shared/celebration-confetti';
import {
  RIDER_AD_FUNNEL_DEFAULTS,
  type RiderAdFunnelConfig,
} from '@/lib/onboarding/rider-ad-funnel-config';
import {
  RIDER_PROFILE_FIELDS_DEFAULTS,
  visibleRideTypes,
  type RiderProfileFieldsConfig,
} from '@/lib/onboarding/rider-profile-fields-config';
import { useOnboardingPreviewMode } from '@/lib/onboarding/preview-mode';
import { RideTypePicker } from '@/components/onboarding/rider/ride-type-picker';
import { HomeAreaPicker } from '@/components/onboarding/rider/home-area-picker';
import type { MarketAreaChip } from '@/components/onboarding/express/market-area-picker.types';

interface Props {
  onComplete: (browseRoute: string) => void;
}

type Step = 'handle' | 'media' | 'location' | 'ride-types' | 'home-area' | 'safety' | 'confirmation';

declare global {
  interface Window {
    posthog?: { capture: (event: string, props?: Record<string, unknown>) => void };
  }
}

function track(event: string, props?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(event, props);
  }
}

export function RiderAdFunnelOnboarding({ onComplete }: Props) {
  const { user } = useUser();
  const preview = useOnboardingPreviewMode();
  const [config, setConfig] = useState<RiderAdFunnelConfig>(RIDER_AD_FUNNEL_DEFAULTS);
  const [profileFieldsConfig, setProfileFieldsConfig] = useState<RiderProfileFieldsConfig>(RIDER_PROFILE_FIELDS_DEFAULTS);
  const [marketName, setMarketName] = useState<string>('your area');
  const [marketAreas, setMarketAreas] = useState<MarketAreaChip[]>([]);
  const [step, setStep] = useState<Step>('handle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — handle
  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [handleReason, setHandleReason] = useState<string | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 2 — media (photo or video)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<'photo' | 'video' | null>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [videoMode, setVideoMode] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Optional steps — gated by admin config visibility
  const [rideTypes, setRideTypes] = useState<string[]>([]);
  const [homeAreaSlug, setHomeAreaSlug] = useState<string | null>(null);

  // Final step — safety toggle (defaults true; matches platform default)
  const [safetyChecksEnabled, setSafetyChecksEnabled] = useState(true);

  // Compute the active step list once config has loaded. 'hidden' / 'deferred'
  // both skip the step inline; the difference (Pre-Ride To-Do for deferred)
  // is a future enhancement when the rider To-Do surface ships.
  const showRideTypes = profileFieldsConfig.fields.rideTypes === 'required'
    || profileFieldsConfig.fields.rideTypes === 'optional';
  const showHomeArea = profileFieldsConfig.fields.homeArea === 'required'
    || profileFieldsConfig.fields.homeArea === 'optional';
  const rideTypesRequired = profileFieldsConfig.fields.rideTypes === 'required';
  const homeAreaRequired = profileFieldsConfig.fields.homeArea === 'required';

  const activeSteps: Step[] = ['handle', 'media', 'location'];
  if (showRideTypes) activeSteps.push('ride-types');
  if (showHomeArea) activeSteps.push('home-area');
  activeSteps.push('safety', 'confirmation');

  // Pre-fill handle suggestion from Clerk first name
  useEffect(() => {
    if (user?.firstName && !handle) {
      setHandle(user.firstName.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull live configs in parallel; defaults are fine if either fails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [funnelRes, fieldsRes] = await Promise.all([
          fetch('/api/onboarding/rider-ad-funnel-config', { cache: 'no-store' }),
          fetch('/api/onboarding/rider-profile-fields-config', { cache: 'no-store' }),
        ]);
        if (cancelled) return;
        if (funnelRes.ok) {
          const body = await funnelRes.json();
          if (body?.config) setConfig(body.config as RiderAdFunnelConfig);
        }
        if (fieldsRes.ok) {
          const body = await fieldsRes.json();
          if (body?.config) setProfileFieldsConfig(body.config as RiderProfileFieldsConfig);
          if (body?.market?.name) setMarketName(body.market.name);
          if (Array.isArray(body?.marketAreas)) setMarketAreas(body.marketAreas as MarketAreaChip[]);
        }
      } catch { /* defaults */ }
    })();
    fbEvent('ViewContent', { content_name: 'rider_ad_funnel_onboarding', content_category: 'rider_funnel' });
    track('rider_ad_funnel_onboarding_view');
    return () => { cancelled = true; };
  }, []);

  // Debounced handle availability check (rider-aware: checks both tables)
  function onHandleChange(val: string) {
    setHandle(val);
    setHandleReason(null);
    setHandleStatus('idle');
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (val.trim().length < 2) return;
    setHandleStatus('checking');
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/riders/check-handle?handle=${encodeURIComponent(val)}`);
        const data = await res.json();
        setHandleStatus(data.available ? 'available' : 'taken');
        if (!data.available && data.reason) setHandleReason(data.reason);
      } catch {
        setHandleStatus('idle');
      }
    }, 400);
  }

  async function handleHandleNext() {
    if (handleStatus !== 'available') return;
    setSaving(true);
    setError(null);
    try {
      const firstName = user?.firstName || handle;
      const lastName = user?.lastName || '.';
      const phone = user?.primaryPhoneNumber?.phoneNumber || null;
      const onboardingPayload = {
        profile_type: 'rider' as const,
        first_name: firstName,
        last_name: lastName,
        display_name: handle,
        phone,
        gender: null,
        pronouns: null,
        lgbtq_friendly: false,
      };

      if (preview.enabled) {
        // Admin /flows preview — surface the would-be POST body and skip the
        // mutation + handle-PATCH so prod state doesn't change while a
        // trainer walks the flow.
        preview.onIntercept?.({ kind: 'rider_ad_funnel_handle_reserved', payload: { ...onboardingPayload, handle } });
      } else {
        const res = await fetch('/api/users/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(onboardingPayload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Could not reserve handle');
        }

        // Persist the handle column. /api/users/onboarding currently only sets
        // display_name; the handle column is rider-only and we want it indexed
        // for global uniqueness. Patch via the rider profile route below if the
        // handle wasn't set; the existing updateRiderProfile path handles it.
        await fetch('/api/rider/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handle }),
        }).catch(() => { /* best-effort — rider profile already created */ });
      }

      fbEvent('Lead', { content_name: 'rider_handle_reserved', content_category: 'rider_funnel' });
      fbCustomEvent('FunnelLead_handle', { funnel_stage: 'handle', audience: 'rider_ad_funnel', handle });
      track('rider_ad_funnel_handle_reserved', { handle });

      setStep('media');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    setMediaUploading(true);
    setError(null);
    try {
      if (preview.enabled) {
        // Don't upload to R2 in preview. Use a local object URL so the UI
        // advances and the uploaded preview thumbnail still renders.
        preview.onIntercept?.({
          kind: 'rider_ad_funnel_photo_upload',
          payload: { fileName: file.name, size: file.size, type: file.type },
        });
        setMediaUrl(URL.createObjectURL(file));
        setMediaKind('photo');
      } else {
        const formData = new FormData();
        formData.append('video', file);
        formData.append('profile_type', 'rider');
        formData.append('media_type', 'photo');
        formData.append('save_to_profile', 'true');
        const res = await fetch('/api/upload/video', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        setMediaUrl(data.url);
        setMediaKind('photo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setMediaUploading(false);
    }
  }

  function handleVideoRecorded(url: string) {
    setMediaUrl(url);
    setMediaKind('video');
    setVideoMode(false);
  }

  function handleMediaNext() {
    if (!mediaUrl) {
      setError('Add a photo or quick video so drivers know who to look for.');
      return;
    }
    setError(null);
    fbCustomEvent('FunnelLead_media', { funnel_stage: 'media', audience: 'rider_ad_funnel', kind: mediaKind });
    track('rider_ad_funnel_media_added', { kind: mediaKind });
    setStep('location');
  }

  // Advance to the next configured step. Used by every step transition so a
  // single source of truth (`activeSteps`) controls flow order regardless of
  // which optional steps the admin enabled.
  function nextStepAfter(current: Step): Step {
    const idx = activeSteps.indexOf(current);
    return activeSteps[idx + 1] ?? 'confirmation';
  }

  function handleLocationNext() {
    fbCustomEvent('FunnelLead_location', { funnel_stage: 'location', audience: 'rider_ad_funnel' });
    track('rider_ad_funnel_location_done');
    setStep(nextStepAfter('location'));
  }

  async function handleRideTypesNext() {
    setSaving(true);
    setError(null);
    try {
      if (preview.enabled) {
        preview.onIntercept?.({
          kind: 'rider_ad_funnel_ride_types_saved',
          payload: { ride_types: rideTypes },
        });
      } else if (rideTypes.length > 0) {
        await fetch('/api/rider/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ride_types: rideTypes }),
        });
      }
      track('rider_ad_funnel_ride_types_done', { count: rideTypes.length, slugs: rideTypes });
      setStep(nextStepAfter('ride-types'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save ride types');
    } finally {
      setSaving(false);
    }
  }

  async function handleHomeAreaNext() {
    setSaving(true);
    setError(null);
    try {
      if (preview.enabled) {
        preview.onIntercept?.({
          kind: 'rider_ad_funnel_home_area_saved',
          payload: { home_area_slug: homeAreaSlug },
        });
      } else if (homeAreaSlug) {
        await fetch('/api/rider/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ home_area_slug: homeAreaSlug }),
        });
      }
      track('rider_ad_funnel_home_area_done', { slug: homeAreaSlug });
      setStep(nextStepAfter('home-area'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save home area');
    } finally {
      setSaving(false);
    }
  }

  async function handleSafetyNext() {
    setSaving(true);
    setError(null);
    try {
      if (preview.enabled) {
        preview.onIntercept?.({
          kind: 'rider_ad_funnel_safety_saved',
          payload: { enabled: safetyChecksEnabled },
        });
      } else {
        // Persist toggle. Endpoint accepts {enabled} per route.ts contract.
        await fetch('/api/user/safety-prefs', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: safetyChecksEnabled }),
        });
      }
      fbCustomEvent('FunnelLead_safety', {
        funnel_stage: 'safety',
        audience: 'rider_ad_funnel',
        safety_checks_enabled: safetyChecksEnabled,
      });
      track('rider_ad_funnel_safety_done', { safety_checks_enabled: safetyChecksEnabled });
      // Final pixel event for ad-conversion optimisation
      fbEvent('CompleteRegistration', {
        content_name: 'rider_ad_funnel',
        content_category: 'rider_funnel',
      });
      track('rider_ad_funnel_complete');
      setStep('confirmation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preferences');
    } finally {
      setSaving(false);
    }
  }

  function handleConfirmation() {
    onComplete(config.browseRoute || '/rider/browse');
  }

  return (
    <div style={{
      minHeight: '100svh', background: '#080808',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 24px 40px',
    }}>
      <div style={{ maxWidth: 380, width: '100%' }}>
        <ProgressBar steps={activeSteps} step={step} />

        {step === 'handle' && (
          <StepHandle
            handle={handle}
            status={handleStatus}
            reason={handleReason}
            saving={saving}
            error={error}
            onChange={onHandleChange}
            onNext={handleHandleNext}
          />
        )}

        {step === 'media' && (
          <StepMedia
            mediaUrl={mediaUrl}
            mediaKind={mediaKind}
            uploading={mediaUploading}
            videoMode={videoMode}
            error={error}
            onPhotoClick={() => photoInputRef.current?.click()}
            onPhotoFile={handlePhotoUpload}
            photoInputRef={photoInputRef}
            onVideoModeOn={() => { setVideoMode(true); setError(null); }}
            onVideoModeOff={() => setVideoMode(false)}
            onVideoRecorded={handleVideoRecorded}
            onNext={handleMediaNext}
          />
        )}

        {step === 'location' && (
          <StepLocation onNext={handleLocationNext} />
        )}

        {step === 'ride-types' && (
          <StepRideTypes
            options={visibleRideTypes(profileFieldsConfig)}
            maxSelections={profileFieldsConfig.maxRideTypeSelections}
            selected={rideTypes}
            onChange={setRideTypes}
            required={rideTypesRequired}
            saving={saving}
            error={error}
            onNext={handleRideTypesNext}
          />
        )}

        {step === 'home-area' && (
          <StepHomeArea
            marketName={marketName}
            areas={marketAreas}
            selected={homeAreaSlug}
            onChange={setHomeAreaSlug}
            required={homeAreaRequired}
            saving={saving}
            error={error}
            onNext={handleHomeAreaNext}
          />
        )}

        {step === 'safety' && (
          <StepSafety
            enabled={safetyChecksEnabled}
            onToggle={setSafetyChecksEnabled}
            saving={saving}
            error={error}
            onNext={handleSafetyNext}
          />
        )}

        {step === 'confirmation' && (
          <StepConfirmation
            cta={config.confirmationCta || 'Browse Drivers'}
            handle={handle}
            mediaUrl={mediaUrl}
            mediaKind={mediaKind}
            onContinue={handleConfirmation}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components — kept inline to keep this a single file
// ============================================================

function ProgressBar({ steps, step }: { steps: Step[]; step: Step }) {
  const idx = steps.indexOf(step);
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
      {steps.map((s, i) => (
        <div
          key={s}
          style={{
            flex: 1, height: 3, borderRadius: 100,
            background: i <= idx ? '#00E676' : 'rgba(255,255,255,0.1)',
            transition: 'background 200ms',
          }}
        />
      ))}
    </div>
  );
}

function StepHeader({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <span style={{
        display: 'inline-block', background: 'rgba(0,230,118,0.12)',
        color: '#00E676', fontSize: 10, fontWeight: 700,
        padding: '4px 12px', borderRadius: 100, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 12,
      }}>
        {kicker}
      </span>
      <h1 style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 32, color: '#fff', lineHeight: 1, marginBottom: 8,
      }}>
        {title}
      </h1>
      <p style={{ fontSize: 14, color: '#888', lineHeight: 1.5 }}>
        {subtitle}
      </p>
    </div>
  );
}

function PrimaryButton({
  onClick, disabled, label, busyLabel, busy,
}: { onClick: () => void; disabled: boolean; label: string; busyLabel?: string; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        width: '100%', padding: 18, borderRadius: 100, border: 'none',
        background: disabled ? 'rgba(0,230,118,0.2)' : '#00E676',
        color: '#080808', fontSize: 17, fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        marginTop: 20, opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? (busyLabel || 'Saving...') : label}
    </button>
  );
}

function StepHandle({
  handle, status, reason, saving, error, onChange, onNext,
}: {
  handle: string;
  status: 'idle' | 'checking' | 'available' | 'taken';
  reason: string | null;
  saving: boolean;
  error: string | null;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const statusText: Record<typeof status, string> = {
    idle: '2+ characters, letters/numbers/_/- only',
    checking: 'Checking…',
    available: '✓ Available',
    taken: reason || 'Already taken — try another',
  };
  const statusColor = status === 'available' ? '#00E676' : status === 'taken' ? '#FF4444' : '#888';

  return (
    <>
      <StepHeader
        kicker="Step 1 of 4"
        title="PICK YOUR HANDLE"
        subtitle="This is how drivers see you. Pick something memorable."
      />
      <input
        type="text"
        value={handle}
        onChange={(e) => onChange(e.target.value)}
        placeholder="yourhandle"
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{
          width: '100%', padding: '16px 20px', borderRadius: 14,
          border: `1px solid ${status === 'available' ? '#00E676' : status === 'taken' ? '#FF4444' : 'rgba(255,255,255,0.1)'}`,
          background: '#141414', color: '#fff', fontSize: 18, outline: 'none',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        }}
      />
      <div style={{ fontSize: 12, color: statusColor, marginTop: 8, minHeight: 16 }}>
        {statusText[status]}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#FF4444', marginTop: 10, textAlign: 'center' }}>{error}</p>
      )}

      <PrimaryButton
        onClick={onNext}
        disabled={status !== 'available'}
        busy={saving}
        label="Reserve handle"
      />

      <p style={{
        fontSize: 10, color: '#555', textAlign: 'center',
        marginTop: 12, lineHeight: 1.5, maxWidth: 300, margin: '12px auto 0',
      }}>
        By continuing, you agree to our{' '}
        <a href="/terms" style={{ color: '#00E676' }}>Terms</a> &amp;{' '}
        <a href="/privacy" style={{ color: '#00E676' }}>Privacy</a>.
      </p>
    </>
  );
}

function StepMedia({
  mediaUrl, mediaKind, uploading, videoMode, error,
  onPhotoClick, onPhotoFile, photoInputRef,
  onVideoModeOn, onVideoModeOff, onVideoRecorded,
  onNext,
}: {
  mediaUrl: string | null;
  mediaKind: 'photo' | 'video' | null;
  uploading: boolean;
  videoMode: boolean;
  error: string | null;
  onPhotoClick: () => void;
  onPhotoFile: (f: File) => void;
  photoInputRef: React.RefObject<HTMLInputElement | null>;
  onVideoModeOn: () => void;
  onVideoModeOff: () => void;
  onVideoRecorded: (url: string) => void;
  onNext: () => void;
}) {
  return (
    <>
      <StepHeader
        kicker="Step 2 of 4"
        title="SHOW YOUR FACE"
        subtitle="Drop a pic or quick vid so your driver knows who to pick up."
      />

      {mediaUrl && (
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          {mediaKind === 'video' ? (
            <video
              src={mediaUrl}
              autoPlay muted loop playsInline
              style={{ width: 160, height: 160, borderRadius: '50%', objectFit: 'cover', border: '3px solid #00E676' }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt="Your avatar"
              style={{ width: 160, height: 160, borderRadius: '50%', objectFit: 'cover', border: '3px solid #00E676' }}
            />
          )}
          <div style={{ fontSize: 12, color: '#00E676', marginTop: 10, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
            ✓ Looking good
          </div>
        </div>
      )}

      {videoMode ? (
        <>
          <VideoRecorder
            onVideoRecorded={onVideoRecorded}
            profileType="rider"
            mediaType="vibe"
            maxDuration={5000}
          />
          <button
            onClick={onVideoModeOff}
            style={{
              width: '100%', marginTop: 10, padding: 12, borderRadius: 100,
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: '#888', fontSize: 13, cursor: 'pointer',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
            }}
          >
            Cancel — pick a different way
          </button>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              type="button"
              onClick={onPhotoClick}
              disabled={uploading}
              style={mediaChoiceStyle(mediaUrl !== null && mediaKind === 'photo', uploading)}
            >
              <span style={{ fontSize: 26 }}>📸</span>
              <span style={{ flex: 1 }}>
                <div>{uploading && mediaKind === null ? 'Uploading…' : 'Upload a photo'}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Fastest. Any selfie works.</div>
              </span>
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPhotoFile(f);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={onVideoModeOn}
              disabled={uploading}
              style={mediaChoiceStyle(mediaUrl !== null && mediaKind === 'video', uploading)}
            >
              <span style={{ fontSize: 26 }}>🎥</span>
              <span style={{ flex: 1 }}>
                <div>Record a 5-sec video</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Builds trust faster than a photo.</div>
              </span>
            </button>
          </div>

          {error && (
            <p style={{ fontSize: 13, color: '#FF4444', marginTop: 14, textAlign: 'center' }}>{error}</p>
          )}

          <PrimaryButton
            onClick={onNext}
            disabled={!mediaUrl || uploading}
            label="Continue"
          />
        </>
      )}
    </>
  );
}

function mediaChoiceStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '16px 20px', borderRadius: 14,
    background: active ? 'rgba(0,230,118,0.14)' : '#141414',
    border: `1px solid ${active ? '#00E676' : 'rgba(255,255,255,0.1)'}`,
    color: '#fff', fontSize: 15, fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer', textAlign: 'left',
    display: 'flex', alignItems: 'center', gap: 14,
    fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
    opacity: disabled ? 0.6 : 1,
  };
}

function StepLocation({ onNext }: { onNext: () => void }) {
  return (
    <>
      <StepHeader
        kicker="Enable location"
        title="ENABLE LOCATION"
        subtitle="So your driver can find you and you can track them in real time."
      />
      <LocationPermission userType="rider" />
      <PrimaryButton onClick={onNext} disabled={false} label="Continue" />
    </>
  );
}

function StepRideTypes({
  options, maxSelections, selected, onChange, required, saving, error, onNext,
}: {
  options: ReturnType<typeof visibleRideTypes>;
  maxSelections: number;
  selected: string[];
  onChange: (next: string[]) => void;
  required: boolean;
  saving: boolean;
  error: string | null;
  onNext: () => void;
}) {
  const canProceed = required ? selected.length > 0 : true;
  return (
    <>
      <StepHeader
        kicker="Why you ride"
        title="WHAT ARE YOU UP TO?"
        subtitle="Helps drivers know what kind of ride to expect. Pick what fits."
      />
      <RideTypePicker
        options={options}
        selectedSlugs={selected}
        maxSelections={maxSelections}
        onChange={onChange}
      />
      {error && (
        <p style={{ fontSize: 13, color: '#FF4444', marginTop: 14, textAlign: 'center' }}>{error}</p>
      )}
      <PrimaryButton
        onClick={onNext}
        disabled={!canProceed}
        busy={saving}
        label={selected.length === 0 && !required ? 'Skip' : 'Continue'}
      />
    </>
  );
}

function StepHomeArea({
  marketName, areas, selected, onChange, required, saving, error, onNext,
}: {
  marketName: string;
  areas: MarketAreaChip[];
  selected: string | null;
  onChange: (slug: string | null) => void;
  required: boolean;
  saving: boolean;
  error: string | null;
  onNext: () => void;
}) {
  const canProceed = required ? !!selected : true;
  return (
    <>
      <StepHeader
        kicker="Home area"
        title="WHERE YOU AT?"
        subtitle={`Pick your home neighborhood in ${marketName}. Drivers nearby get prioritized.`}
      />
      <HomeAreaPicker
        marketName={marketName}
        areas={areas}
        selectedSlug={selected}
        onChange={onChange}
      />
      {error && (
        <p style={{ fontSize: 13, color: '#FF4444', marginTop: 14, textAlign: 'center' }}>{error}</p>
      )}
      <PrimaryButton
        onClick={onNext}
        disabled={!canProceed}
        busy={saving}
        label={!selected && !required ? 'Skip' : 'Continue'}
      />
    </>
  );
}

function StepSafety({
  enabled, onToggle, saving, error, onNext,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  saving: boolean;
  error: string | null;
  onNext: () => void;
}) {
  return (
    <>
      <StepHeader
        kicker="Step 4 of 4"
        title="YOUR SAFETY MATTERS"
        subtitle="Here's how we keep you safe."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <SafetyRow icon="🛡️" title="End To End ETA Tracking" body="Every Ride Is Safe & Secure GPS Enabled for Rider Security." />
        <SafetyRow icon="🚨" title="One-tap distress" body="A ride detail you can hit anytime — admin gets alerted instantly." />
        <SafetyRow icon="📍" title="Geo-verified end-of-ride" body="Both parties confirm. Mismatched locations get flagged." />
      </div>

      {/* The toggle that the new flow specifically adds. */}
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        style={{
          width: '100%', padding: '16px 18px', borderRadius: 14,
          background: enabled ? 'rgba(0,230,118,0.10)' : '#141414',
          border: `1px solid ${enabled ? '#00E676' : 'rgba(255,255,255,0.1)'}`,
          color: '#fff', textAlign: 'left' as const, cursor: 'pointer',
          fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}
      >
        <span>
          <div style={{ fontSize: 15, fontWeight: 700 }}>In-ride safety check-ins</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4, lineHeight: 1.4 }}>
            We&apos;ll ping you mid-ride. One tap to confirm you&apos;re good. Adjustable later.
          </div>
        </span>
        <span style={{
          width: 44, height: 26, borderRadius: 100,
          background: enabled ? '#00E676' : 'rgba(255,255,255,0.15)',
          position: 'relative' as const, transition: 'background 150ms',
          flexShrink: 0,
        }}>
          <span style={{
            position: 'absolute' as const, top: 3, left: enabled ? 21 : 3,
            width: 20, height: 20, borderRadius: '50%', background: '#fff',
            transition: 'left 150ms',
          }} />
        </span>
      </button>

      {error && (
        <p style={{ fontSize: 13, color: '#FF4444', marginTop: 10, textAlign: 'center' }}>{error}</p>
      )}

      <PrimaryButton onClick={onNext} disabled={false} busy={saving} label="Finish" busyLabel="Saving…" />
    </>
  );
}

function SafetyRow({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px', borderRadius: 12,
      background: '#141414', border: '1px solid rgba(255,255,255,0.06)',
    }}>
      <span style={{ fontSize: 22, lineHeight: 1, marginTop: 2 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{title}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2, lineHeight: 1.4 }}>{body}</div>
      </div>
    </div>
  );
}

function StepConfirmation({
  cta, handle, mediaUrl, mediaKind, onContinue,
}: {
  cta: string;
  handle: string;
  mediaUrl: string | null;
  mediaKind: 'photo' | 'video' | null;
  onContinue: () => void;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <CelebrationConfetti active variant="cannon" />

      {/* Identity card — avatar + handle so the rider sees themselves
          before the next surface. Falls back to the green-check if media
          somehow didn't upload. */}
      {mediaUrl ? (
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
          {mediaKind === 'video' ? (
            <video
              src={mediaUrl}
              autoPlay muted loop playsInline
              style={{
                width: 120, height: 120, borderRadius: '50%',
                objectFit: 'cover', border: '3px solid #00E676',
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt={handle}
              style={{
                width: 120, height: 120, borderRadius: '50%',
                objectFit: 'cover', border: '3px solid #00E676',
              }}
            />
          )}
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 30, height: 30, borderRadius: '50%', background: '#00E676',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '3px solid #080808',
          }}>
            <Check className="w-4 h-4 text-black" strokeWidth={3} />
          </div>
        </div>
      ) : (
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(0,230,118,0.15)', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: '#00E676',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check className="w-7 h-7 text-black" strokeWidth={3} />
          </div>
        </div>
      )}

      <div style={{
        fontSize: 12, color: '#00E676', fontWeight: 700, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 4,
      }}>
        @{handle}
      </div>

      <h1 style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 36, color: '#fff', lineHeight: 1, marginBottom: 8,
      }}>
        YOU&apos;RE IN!
      </h1>
      <p style={{ fontSize: 14, color: '#888', lineHeight: 1.5, marginBottom: 24 }}>
        Real Atlanta drivers are live right now. Pick one and link payment when you&apos;re ready to ride.
      </p>
      <PrimaryButton onClick={onContinue} disabled={false} label={cta} />
    </div>
  );
}
