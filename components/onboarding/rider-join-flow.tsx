'use client';

import {
  useCallback, useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useSignUp, useSignIn } from '@clerk/nextjs';
import dynamic from 'next/dynamic';

const CelebrationConfetti = dynamic(
  () => import('@/components/shared/celebration-confetti'),
  { ssr: false },
);

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'market' | 'phone' | 'otp' | 'avatar' | 'done';
type AuthMode = 'sign-up' | 'sign-in';

interface MarketData {
  slug: string;
  name: string;
  driverCount: number;
  displayCount: string;
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const GREEN = '#00E676';
const CARD_BG = '#141414';
const BORDER = 'rgba(255,255,255,0.08)';
const FONT_DISPLAY = "var(--font-display, 'Bebas Neue', sans-serif)";
const FONT_MONO = "var(--font-mono, 'Space Mono', monospace)";

// ── Shared sub-components ─────────────────────────────────────────────────────

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
      <span style={{ fontFamily: FONT_DISPLAY, fontSize: 42, color: GREEN, letterSpacing: 3 }}>HMU</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: 'rgba(255,255,255,0.35)', letterSpacing: 4 }}>ATL</span>
    </div>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 20 : 6,
            height: 4,
            borderRadius: 2,
            background: i === current ? GREEN : 'rgba(255,255,255,0.12)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

function DriverBadge({ displayCount, name }: { displayCount: string; name: string }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.2)',
      borderRadius: 100, padding: '6px 14px',
    }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN }} />
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: GREEN, letterSpacing: 1 }}>
        {displayCount} DRIVERS IN {name.toUpperCase()}
      </span>
    </div>
  );
}

function Btn({
  label, onClick, disabled, loading, color = GREEN, textColor = '#000',
}: {
  label: string; onClick: () => void; disabled?: boolean; loading?: boolean;
  color?: string; textColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        width: '100%', padding: '17px 0', borderRadius: 100,
        background: disabled || loading ? 'rgba(255,255,255,0.06)' : color,
        color: disabled || loading ? 'rgba(255,255,255,0.25)' : textColor,
        fontFamily: FONT_MONO, fontSize: 13, letterSpacing: 2,
        border: 'none', cursor: disabled || loading ? 'default' : 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {loading ? '...' : label}
    </button>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{
      background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.25)',
      borderRadius: 10, padding: '10px 14px',
    }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#FF5252', letterSpacing: 0.5 }}>{msg}</span>
    </div>
  );
}

// ── OTP boxes ─────────────────────────────────────────────────────────────────

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const chars = value.split('').concat(Array(6).fill('')).slice(0, 6);

  function handleChange(i: number, v: string) {
    const digit = v.replace(/\D/g, '').slice(-1);
    const next = chars.map((c, idx) => (idx === i ? digit : c));
    onChange(next.join(''));
    if (digit && i < 5) refs.current[i + 1]?.focus();
  }

  function handleKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !chars[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, '').slice(0, 6));
    refs.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={chars[i]}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: 46, height: 58, borderRadius: 12, textAlign: 'center',
            background: chars[i] ? 'rgba(0,230,118,0.08)' : CARD_BG,
            border: `1.5px solid ${chars[i] ? GREEN : BORDER}`,
            color: '#fff', fontSize: 24, fontFamily: FONT_MONO,
            outline: 'none', transition: 'all 0.15s ease',
          }}
        />
      ))}
    </div>
  );
}

// ── Avatar uploader ───────────────────────────────────────────────────────────

function AvatarUploader({
  onUploaded, onSkip,
}: {
  onUploaded: (url: string) => void;
  onSkip: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Photos only'); return; }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('profile_type', 'rider');
      fd.append('media_type', 'photo');
      fd.append('save_to_profile', 'true');
      const res = await fetch('/api/upload/video', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json() as { url: string };
      onUploaded(url);
    } catch {
      setError('Upload failed. Try again or skip.');
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }}
      />

      <button
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', height: 160, borderRadius: 20,
          background: CARD_BG, border: `2px dashed ${BORDER}`,
          cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          overflow: 'hidden', position: 'relative',
          transition: 'border-color 0.2s',
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="preview"
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
          />
        ) : (
          <>
            <span style={{ fontSize: 40 }}>📸</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>
              TAP TO ADD PHOTO
            </span>
          </>
        )}
        {uploading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: GREEN, letterSpacing: 1 }}>UPLOADING...</span>
          </div>
        )}
      </button>

      {error && <ErrorMsg msg={error} />}

      <Btn label="SKIP FOR NOW" onClick={onSkip} color="rgba(255,255,255,0.06)" textColor="rgba(255,255,255,0.4)" />
    </div>
  );
}

// ── Main flow ─────────────────────────────────────────────────────────────────

export function RiderJoinFlow() {
  const router = useRouter();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();

  const [step, setStep] = useState<Step>('market');
  const [authMode, setAuthMode] = useState<AuthMode>('sign-up');
  const [entering, setEntering] = useState(false);

  // Market
  const [market, setMarket] = useState<MarketData | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // Phone / OTP
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Confetti
  const [confettiActive, setConfettiActive] = useState(false);

  // ── Step transitions ──────────────────────────────────────────────────────

  function goTo(next: Step) {
    setEntering(true);
    setTimeout(() => {
      setStep(next);
      setEntering(false);
    }, 160);
  }

  // ── Market check ─────────────────────────────────────────────────────────

  const checkMarket = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(`/api/markets/discover?lat=${lat}&lng=${lng}`);
      const data = await res.json() as { isActive: boolean; slug?: string; name?: string; driverCount?: number; displayCount?: string };
      if (data.isActive && data.slug) {
        setMarket({ slug: data.slug, name: data.name!, driverCount: data.driverCount!, displayCount: data.displayCount! });
        setLocError(null);
      } else {
        setLocError("HMU isn't in your city yet — but we're expanding fast.");
      }
    } catch {
      setLocError("Couldn't check your city. Try again.");
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    setLocating(true);
    if (!navigator.geolocation) {
      // Fallback: assume ATL
      void checkMarket(33.7490, -84.3880);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => void checkMarket(pos.coords.latitude, pos.coords.longitude),
      () => void checkMarket(33.7490, -84.3880), // fail open to ATL
      { timeout: 7000, enableHighAccuracy: false },
    );
  }, [checkMarket]);

  // ── Phone auth ────────────────────────────────────────────────────────────

  async function sendCode() {
    if (!signUpLoaded || !signInLoaded || !phone.trim()) return;
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      if (authMode === 'sign-up') {
        await signUp!.create({ phoneNumber: phone });
        await signUp!.preparePhoneNumberVerification({ strategy: 'phone_code' });
      } else {
        await signIn!.create({ strategy: 'phone_code', identifier: phone });
        const phoneFactor = signIn!.supportedFirstFactors?.find(
          (f: { strategy: string }) => f.strategy === 'phone_code',
        ) as { strategy: 'phone_code'; phoneNumberId: string } | undefined;
        if (!phoneFactor) throw new Error('Phone sign-in not available');
        await signIn!.prepareFirstFactor({ strategy: 'phone_code', phoneNumberId: phoneFactor.phoneNumberId });
      }
      goTo('otp');
    } catch (e: unknown) {
      const clerkErr = (e as { errors?: { code?: string; message?: string }[] }).errors?.[0];
      if (clerkErr?.code === 'form_identifier_exists') {
        // Phone already registered — switch to sign-in silently
        setAuthMode('sign-in');
        setPhoneLoading(false);
        try {
          await signIn!.create({ strategy: 'phone_code', identifier: phone });
          const phoneFactor = signIn!.supportedFirstFactors?.find(
            (f: { strategy: string }) => f.strategy === 'phone_code',
          ) as { strategy: 'phone_code'; phoneNumberId: string } | undefined;
          if (phoneFactor) {
            await signIn!.prepareFirstFactor({ strategy: 'phone_code', phoneNumberId: phoneFactor.phoneNumberId });
            goTo('otp');
          }
        } catch {
          setPhoneError('Could not send code. Try again.');
        }
        return;
      }
      const msg = clerkErr?.message ?? 'Could not send code. Try again.';
      // Rate-limited but code may have been sent
      if (msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('rate')) {
        goTo('otp');
      } else {
        setPhoneError(msg);
      }
    } finally {
      setPhoneLoading(false);
    }
  }

  async function verifyOtp() {
    if (otp.length < 6) return;
    setOtpLoading(true);
    setOtpError(null);
    try {
      if (authMode === 'sign-up') {
        const result = await signUp!.attemptPhoneNumberVerification({ code: otp });
        if (result.status === 'complete') {
          await setActiveSignUp!({ session: result.createdSessionId });
          goTo('avatar');
        }
      } else {
        const result = await signIn!.attemptFirstFactor({ strategy: 'phone_code', code: otp });
        if (result.status === 'complete') {
          await setActiveSignIn!({ session: result.createdSessionId });
          // Existing user — skip avatar, go straight to done
          goTo('done');
          setTimeout(() => setConfettiActive(true), 400);
        }
      }
    } catch (e: unknown) {
      const msg = (e as { errors?: { message?: string }[] }).errors?.[0]?.message ?? 'Invalid code';
      setOtpError(msg);
      setOtp('');
    } finally {
      setOtpLoading(false);
    }
  }

  // Auto-verify when 6 digits entered
  useEffect(() => {
    if (otp.length === 6 && step === 'otp') void verifyOtp();
  }, [otp]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Avatar done → final step ──────────────────────────────────────────────

  function finishAvatar() {
    goTo('done');
    setTimeout(() => setConfettiActive(true), 400);
  }

  // ── Wrapper styles ────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 400,
    margin: '0 auto',
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100dvh',
    justifyContent: 'center',
    opacity: entering ? 0 : 1,
    transform: entering ? 'translateY(10px)' : 'none',
    transition: 'opacity 0.25s ease, transform 0.25s ease',
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle} key={step}>

      {/* ── MARKET CHECK ── */}
      {step === 'market' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Logo />
          <div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 48, color: '#fff', margin: 0, lineHeight: 1 }}>
              CREW-BUILT RIDES.
            </h1>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 48, color: GREEN, margin: 0, lineHeight: 1 }}>
              YOUR CITY.
            </h2>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
            Peer-to-peer rides by and for Atlanta. No surge pricing. Real drivers you can trust.
          </p>

          {locating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, animation: 'pulse 1s infinite' }} />
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>
                CHECKING YOUR CITY...
              </span>
            </div>
          )}

          {market && !locating && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: FONT_DISPLAY, fontSize: 32, color: '#fff' }}>
                  {market.name.toUpperCase()}
                </span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                  ✓ IN SERVICE
                </span>
              </div>
              <DriverBadge displayCount={market.displayCount} name={market.name} />
            </div>
          )}

          {locError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ErrorMsg msg={locError} />
              <p style={{ fontFamily: FONT_MONO, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5 }}>
                We're expanding — sign up and we'll notify you when HMU hits your city.
              </p>
            </div>
          )}

          <Btn
            label={locError ? 'JOIN THE WAITLIST' : 'GET IN →'}
            onClick={() => goTo('phone')}
            disabled={locating}
          />

          <p style={{ fontFamily: FONT_MONO, fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center', letterSpacing: 0.5 }}>
            Already in the crew?{' '}
            <a
              href="/sign-in"
              style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'underline' }}
            >
              Sign in →
            </a>
          </p>
        </div>
      )}

      {/* ── PHONE ── */}
      {step === 'phone' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Logo />
          <StepDots total={4} current={0} />
          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 40, color: '#fff', margin: 0, lineHeight: 1.1 }}>
              WHAT'S YOUR NUMBER?
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
              We'll text you a code. No spam, ever.
            </p>
          </div>

          <input
            type="tel"
            placeholder="+1 (404) 555-0000"
            value={phone}
            onChange={e => { setPhone(e.target.value); setPhoneError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') void sendCode(); }}
            autoFocus
            style={{
              width: '100%', padding: '16px 18px', borderRadius: 14,
              background: CARD_BG, border: `1.5px solid ${BORDER}`,
              color: '#fff', fontSize: 18, fontFamily: "'DM Sans', sans-serif",
              outline: 'none', boxSizing: 'border-box',
            }}
          />

          {phoneError && <ErrorMsg msg={phoneError} />}

          <Btn
            label="SEND CODE →"
            onClick={() => void sendCode()}
            disabled={!phone.trim() || !signUpLoaded || !signInLoaded}
            loading={phoneLoading}
          />

          {market && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <DriverBadge displayCount={market.displayCount} name={market.name} />
            </div>
          )}

          <button
            onClick={() => goTo('market')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 }}
          >
            ← Back
          </button>
        </div>
      )}

      {/* ── OTP ── */}
      {step === 'otp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Logo />
          <StepDots total={4} current={1} />
          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 40, color: '#fff', margin: 0, lineHeight: 1.1 }}>
              CHECK YOUR TEXTS.
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
              Enter the 6-digit code we sent to {phone}.
            </p>
          </div>

          <OtpInput value={otp} onChange={setOtp} />

          {otpError && <ErrorMsg msg={otpError} />}

          <Btn
            label="VERIFY →"
            onClick={() => void verifyOtp()}
            disabled={otp.length < 6}
            loading={otpLoading}
          />

          <button
            onClick={() => { setOtp(''); goTo('phone'); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 }}
          >
            ← Wrong number?
          </button>
        </div>
      )}

      {/* ── AVATAR ── */}
      {step === 'avatar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Logo />
          <StepDots total={4} current={2} />
          <div>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 40, color: '#fff', margin: 0, lineHeight: 1.1 }}>
              PUT A FACE TO IT.
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
              Drivers want to know who they're picking up. Optional — takes 10 seconds.
            </p>
          </div>

          <AvatarUploader onUploaded={finishAvatar} onSkip={finishAvatar} />
        </div>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'center', textAlign: 'center' }}>
          <CelebrationConfetti active={confettiActive} variant="cannon" />

          <Logo />

          <div>
            <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 52, color: GREEN, margin: 0, lineHeight: 1 }}>
              YOU'RE IN
            </h1>
            <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 52, color: '#fff', margin: 0, lineHeight: 1 }}>
              THE CREW.
            </h2>
          </div>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: 320 }}>
            Welcome to Atlanta's crew-built ride network. Your driver is one HMU away.
          </p>

          {market && (
            <DriverBadge displayCount={market.displayCount} name={market.name} />
          )}

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Btn
              label={`FIND A DRIVER IN ${market?.name.toUpperCase() ?? 'YOUR CITY'} →`}
              onClick={() => router.push('/rider/browse?firstTime=1')}
            />
            <button
              onClick={() => router.push('/rider/home')}
              style={{
                background: 'none', border: `1px solid ${BORDER}`, borderRadius: 100,
                padding: '14px 0', color: 'rgba(255,255,255,0.4)',
                fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 1.5, cursor: 'pointer', width: '100%',
              }}
            >
              GO TO MY HOME
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
