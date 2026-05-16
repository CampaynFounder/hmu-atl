'use client';

// Post-auth handoff for the Blast funnel.
//   ?mode=signup → single account_setup screen (handle + photo) → confetti →
//                  auto-send blast → redirect to offer board
//   ?mode=signin → confetti + auto-send blast (no account_setup, no review)
//
// PR 3b reshape: removed the standalone "review" step so the rider doesn't
// have to confirm twice (they already confirmed by tapping "Notify Drivers"
// in the form). For signup, both the handle picker and photo uploader live
// on one screen so they're not stacked into separate friction steps.
//
// On send: POST /api/blast (Stream B's endpoint). On success → redirect to
// /rider/blast/[shortcode] (Stream B's offer board). Draft loads from
// localStorage (saved by /rider/blast/new before the auth round-trip).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { posthog } from '@/components/analytics/posthog-provider';
import {
  PulseOnMount,
  ShimmerSlot,
  SuccessCheckmark,
} from '@/components/blast/motion';
import CelebrationConfetti from '@/components/shared/celebration-confetti';
import {
  loadBlastDraft,
  clearBlastDraft,
} from '@/lib/storage/blast-draft';
import type {
  BlastCreateInput,
  BlastCreateResult,
  BlastDraft,
} from '@/lib/blast/types';

type Mode = 'signup' | 'signin';
type Step =
  | 'restoring'        // initial state — pulling draft from localStorage
  | 'no_draft'         // expired / missing — bounce to /blast
  | 'account_setup'    // signup only — handle + photo on a single screen
  | 'sending'          // POST /api/blast in flight
  | 'sent'             // success → redirect imminent
  | 'error';           // network/server error — retry option

const HEADER_PAD = 'var(--header-height, 3.5rem)';
const HANDLE_DEBOUNCE_MS = 500;
const HANDLE_PATTERN = /^[a-z0-9_-]{2,}$/;

interface HandleStatus {
  state: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  reason?: string;
}

export default function BlastHandoffClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded: clerkLoaded, isSignedIn } = useUser();
  const reduceMotion = useReducedMotion();

  const mode: Mode = (searchParams.get('mode') === 'signin' ? 'signin' : 'signup');
  const [step, setStep] = useState<Step>('restoring');
  const [draft, setDraft] = useState<BlastDraft | null>(null);

  // Username state (signup only)
  const [handle, setHandle] = useState('');
  const [handleStatus, setHandleStatus] = useState<HandleStatus>({ state: 'idle' });
  const [confettiArmed, setConfettiArmed] = useState(false);
  const handleDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Photo state (signup only)
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploaded, setPhotoUploaded] = useState(false);

  // Send state
  const [sendError, setSendError] = useState<string | null>(null);

  // sendBlast is declared further down with useCallback so it can close over
  // state setters; commitAndSend (signup path) calls it via a ref because it
  // is defined before sendBlast in source order.
  const sendBlastRef = useRef<(() => Promise<void>) | null>(null);

  // Idempotency guard for the signin auto-send effect. The effect below runs
  // whenever its deps change (draft, sendBlast); without this we'd risk
  // firing the POST twice if a re-render happened to land while still in
  // 'sending' state.
  const autoSendFiredRef = useRef(false);

  // ─── Mount: restore draft + decide first step ─────────────────────────────
  useEffect(() => {
    if (!clerkLoaded) return;
    const restored = loadBlastDraft();
    if (!restored) {
      setStep('no_draft');
      posthog.capture('blast_draft_expired', { mode });
      return;
    }
    setDraft(restored);
    posthog.capture('blast_draft_restored', {
      mode,
      ageMs: Date.now() - restored.draftCreatedAt,
    });
    if (mode === 'signin') {
      // Existing rider — they already have a handle + (probably) a photo
      // from a prior sign-up. Skip account_setup, fire confetti, advance to
      // 'sending'. The auto-send effect below fires sendBlast once draft +
      // sendBlast are both committed — using setTimeout(0) + ref here raced
      // the draft state commit and left sendBlast closed over a null draft
      // (silent stall).
      posthog.capture('blast_handoff_signin_started');
      setConfettiArmed(true);
      setStep('sending');
    } else {
      posthog.capture('blast_handoff_signup_started');
      setStep('account_setup');
    }
  }, [clerkLoaded, mode]);

  // ─── Signin auto-send: fire once draft is restored + sendBlast is fresh ──
  // Replaces the prior setTimeout(0) pattern. Effect re-runs as draft and
  // sendBlast settle; autoSendFiredRef ensures exactly one POST.
  useEffect(() => {
    if (autoSendFiredRef.current) return;
    if (mode !== 'signin') return;
    if (step !== 'sending') return;
    if (!draft) return;
    autoSendFiredRef.current = true;
    void sendBlast();
    // sendBlast intentionally omitted from deps — it re-creates when draft
    // changes, but draft is already in deps so the effect re-runs anyway.
    // The ref guard above ensures only the first valid run actually fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step, draft]);

  // ─── Bounce if no draft ───────────────────────────────────────────────────
  useEffect(() => {
    if (step === 'no_draft') {
      const t = setTimeout(() => router.replace('/blast'), 1200);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  // ─── Username debounced check ─────────────────────────────────────────────
  const onHandleChange = useCallback((next: string) => {
    const v = next.toLowerCase().trim();
    setHandle(v);
    if (handleDebounceRef.current) clearTimeout(handleDebounceRef.current);

    if (!v) {
      setHandleStatus({ state: 'idle' });
      return;
    }
    if (!HANDLE_PATTERN.test(v)) {
      setHandleStatus({ state: 'invalid', reason: 'Use a-z, 0-9, _ or - (min 2 chars)' });
      return;
    }
    setHandleStatus({ state: 'checking' });
    handleDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/riders/check-handle?handle=${encodeURIComponent(v)}`);
        const data = await res.json();
        if (data.available) {
          setHandleStatus({ state: 'available' });
        } else {
          setHandleStatus({ state: 'taken', reason: data.reason });
        }
        posthog.capture('blast_username_check', {
          available: !!data.available,
          reason: data.reason,
        });
      } catch {
        setHandleStatus({ state: 'idle' });
      }
    }, HANDLE_DEBOUNCE_MS);
  }, []);

  // ─── Photo upload ─────────────────────────────────────────────────────────
  // Uploads on selection so the CTA can fire-and-redirect once the rider
  // commits. No step advance here — the combined account_setup screen owns
  // the funnel forward motion.
  const onPhotoSelected = useCallback(async (file: File) => {
    setPhotoFile(file);
    setPhotoUploading(true);
    setSendError(null);
    try {
      const fd = new FormData();
      fd.append('video', file);                    // existing endpoint param name
      fd.append('profile_type', 'rider');
      fd.append('media_type', 'photo');
      fd.append('save_to_profile', 'true');
      const res = await fetch('/api/upload/video', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('upload failed');
      setPhotoUploaded(true);
      posthog.capture('blast_photo_uploaded', {
        sizeBytes: file.size,
        mimeType: file.type,
      });
    } catch {
      setSendError('Upload failed — try a different photo.');
    } finally {
      setPhotoUploading(false);
    }
  }, []);

  // ─── Commit account setup + send blast (signup path) ──────────────────────
  // Persists the chosen handle, fires confetti, then auto-sends. Disabled
  // until both handle is 'available' and photo upload finished.
  const accountSetupReady =
    handleStatus.state === 'available' && photoUploaded && !photoUploading;

  const commitAndSend = useCallback(async () => {
    if (!accountSetupReady) return;
    // Persist the handle non-blocking — uniqueness was already validated by
    // /api/riders/check-handle so a race-loss here is extremely unlikely;
    // if it happens, the rider lands on the offer board with their previous
    // (possibly null) handle, which the offer board surfaces gracefully.
    fetch('/api/rider/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    }).catch(() => { /* non-fatal — see comment above */ });

    setConfettiArmed(true);
    posthog.capture('blast_account_setup_committed', { handle });
    void sendBlastRef.current?.();
  }, [accountSetupReady, handle]);

  // ─── Send Blast ───────────────────────────────────────────────────────────
  const sendBlast = useCallback(async () => {
    if (!draft) return;
    setSendError(null);
    setStep('sending');
    posthog.capture('blast_submitted', {
      priceDollars: draft.priceDollars,
      hasGenderPref: draft.driverPreference.preferred.length > 0,
    });
    try {
      // marketSlug resolved on the server via cookie / user.market_id; client
      // can pass a default. Stream B accepts BlastCreateInput.
      const payload: BlastCreateInput = { ...draft, marketSlug: 'atl' };
      const res = await fetch('/api/blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 501) {
        setSendError('Blast service is deploying — try again in a moment.');
        setStep('error');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSendError(body.error || 'Could not send blast — try again.');
        setStep('error');
        return;
      }
      const body: BlastCreateResult = await res.json();
      clearBlastDraft();
      setStep('sent');
      router.push(`/rider/blast/${body.shortcode}`);
    } catch {
      setSendError('Network problem — check your connection and try again.');
      setStep('error');
    }
  }, [draft, router]);

  // Keep the ref in sync so the mount effect (signin auto-send) and
  // commitAndSend (signup flow) call the latest sendBlast closure.
  useEffect(() => {
    sendBlastRef.current = sendBlast;
  }, [sendBlast]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!clerkLoaded || step === 'restoring') {
    return (
      <FullPageShell>
        <ShimmerSlot height={56} radius={14} />
        <ShimmerSlot height={120} radius={20} />
      </FullPageShell>
    );
  }

  if (!isSignedIn) {
    // Defensive — Clerk should have completed auth before sending users here.
    return (
      <FullPageShell>
        <p style={{ color: 'rgba(255,255,255,0.78)' }}>
          Hold on a sec — finishing sign-in…
        </p>
      </FullPageShell>
    );
  }

  if (step === 'no_draft') {
    return (
      <FullPageShell>
        <PulseOnMount>
          <h1 style={{ ...H1_STYLE }}>Let&apos;s start fresh</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
            Bouncing you back to /blast…
          </p>
        </PulseOnMount>
      </FullPageShell>
    );
  }

  return (
    <FullPageShell>
      <CelebrationConfetti active={confettiArmed} variant="burst" />
      <AnimatePresence mode="wait">
        {step === 'account_setup' && (
          <motion.div
            key="account_setup"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
            <div>
              <h1 style={H1_STYLE}>One quick thing</h1>
              <p style={SUB_STYLE}>
                Pick a handle and snap a photo so drivers know who&rsquo;s pulling up.
                Required &mdash; we don&rsquo;t notify drivers for ghost accounts.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={FIELD_LABEL_STYLE}>Your handle</label>
              <UsernameField
                value={handle}
                onChange={onHandleChange}
                status={handleStatus}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={FIELD_LABEL_STYLE}>Your photo</label>
              <PhotoStep
                file={photoFile}
                uploading={photoUploading}
                uploaded={photoUploaded}
                onSelect={onPhotoSelected}
              />
            </div>

            <PrimaryButton
              onClick={commitAndSend}
              disabled={!accountSetupReady}
              label="Notify Drivers"
            />
          </motion.div>
        )}

        {step === 'sending' && (
          <motion.div
            key="sending"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            style={{ textAlign: 'center', padding: '32px 0' }}
          >
            <h2 style={H2_STYLE}>Notifying drivers…</h2>
            <p style={SUB_STYLE}>One moment.</p>
          </motion.div>
        )}

        {step === 'sent' && (
          <motion.div
            key="sent"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            style={{ textAlign: 'center', padding: '32px 0' }}
          >
            <SuccessCheckmark size={64} />
            <h2 style={{ ...H2_STYLE, marginTop: 16 }}>Sent!</h2>
            <p style={SUB_STYLE}>Taking you to your offer board…</p>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div
            key="error"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
          >
            <h2 style={{ ...H2_STYLE, color: '#FF4444' }}>Hmm, that didn&apos;t work</h2>
            <p style={SUB_STYLE}>{sendError}</p>
            <PrimaryButton onClick={sendBlast} label="Try again" />
          </motion.div>
        )}
      </AnimatePresence>
    </FullPageShell>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FullPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        paddingTop: HEADER_PAD,
        paddingLeft: 20,
        paddingRight: 20,
        paddingBottom: 32,
        background: '#080808',
        color: '#fff',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      }}
    >
      <div style={{ maxWidth: 480, margin: '24px auto 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {children}
      </div>
    </main>
  );
}

function UsernameField({
  value,
  onChange,
  status,
}: {
  value: string;
  onChange: (v: string) => void;
  status: HandleStatus;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          borderRadius: 14,
          background: 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${
            status.state === 'available'
              ? '#00E676'
              : status.state === 'taken' || status.state === 'invalid'
                ? '#FF4444'
                : 'rgba(255,255,255,0.12)'
          }`,
          transition: 'border-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>@</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="yourhandle"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontSize: 16,
            fontFamily: 'inherit',
            minWidth: 0,
          }}
        />
        <StatusGlyph status={status} />
      </div>
      {status.reason && (
        <p style={{ fontSize: 13, color: status.state === 'available' ? '#00E676' : '#FF8A8A', margin: 0 }}>
          {status.reason}
        </p>
      )}
    </div>
  );
}

function StatusGlyph({ status }: { status: HandleStatus }) {
  if (status.state === 'checking') {
    return (
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        style={{
          width: 16,
          height: 16,
          border: '2px solid rgba(255,255,255,0.2)',
          borderTopColor: '#fff',
          borderRadius: '50%',
        }}
      />
    );
  }
  if (status.state === 'available') return <SuccessCheckmark size={20} />;
  if (status.state === 'taken' || status.state === 'invalid') {
    return <span style={{ color: '#FF4444', fontSize: 18 }}>✕</span>;
  }
  return null;
}

function PhotoStep({
  file,
  uploading,
  uploaded,
  onSelect,
}: {
  file: File | null;
  uploading: boolean;
  uploaded: boolean;
  onSelect: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={(e) => e.target.files?.[0] && onSelect(e.target.files[0])}
        style={{ display: 'none' }}
      />

      {!file && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            padding: '20px',
            borderRadius: 20,
            background: 'rgba(0,230,118,0.1)',
            border: '2px dashed rgba(0,230,118,0.4)',
            color: '#00E676',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            minHeight: 180,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 32 }}>📷</span>
          Take a photo
        </button>
      )}

      {file && previewUrl && (
        <PulseOnMount>
          <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#141414' }}>
            <img
              src={previewUrl}
              alt="Your photo"
              style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }}
            />
            {uploading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                Uploading…
              </div>
            )}
            {uploaded && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                }}
              >
                <SuccessCheckmark size={36} />
              </div>
            )}
          </div>
          {!uploading && !uploaded && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{ ...SECONDARY_BUTTON_STYLE, marginTop: 12 }}
            >
              Choose a different one
            </button>
          )}
        </PulseOnMount>
      )}
    </div>
  );
}

function PrimaryButton({
  onClick,
  label,
  disabled,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        width: '100%',
        padding: '16px 24px',
        borderRadius: 100,
        background: disabled ? 'rgba(0,230,118,0.25)' : '#00E676',
        color: disabled ? 'rgba(8,8,8,0.5)' : '#080808',
        fontSize: 16,
        fontWeight: 700,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {label}
    </motion.button>
  );
}

const H1_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
  fontSize: 40,
  lineHeight: 0.95,
  letterSpacing: 1,
  margin: '0 0 4px',
  color: '#fff',
};
const H2_STYLE: React.CSSProperties = {
  ...H1_STYLE,
  fontSize: 28,
};
const SUB_STYLE: React.CSSProperties = {
  fontSize: 15,
  color: 'rgba(255,255,255,0.6)',
  margin: 0,
};
const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)',
  fontWeight: 600,
};
const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '12px 20px',
  borderRadius: 100,
  background: 'transparent',
  color: 'rgba(255,255,255,0.78)',
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.15)',
  cursor: 'pointer',
  fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
};
