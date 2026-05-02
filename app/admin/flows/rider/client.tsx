'use client';

// Rider — Standard Sign-up flow preview. Mirrors the production funnel:
//   1) /sign-up?type=rider or /r/express → RiderOnboarding
//   2) lands on /rider/browse?firstTime=1
//   3) FirstTimePaymentBlocker overlays the page until card linked
//
// We mount the same components prod uses, wrapped in OnboardingPreviewProvider
// so RiderOnboarding skips the /api/users/onboarding POST and the inline
// Stripe SetupIntent inside FirstTimePaymentBlocker is replaced with a stub.
// Single source of truth — no parallel "preview" copy of either component.

import { useState } from 'react';
import Link from 'next/link';
import { RiderOnboarding } from '@/components/onboarding/rider-onboarding';
import { FirstTimePaymentBlocker } from '@/components/rider/first-time-payment-blocker';
import { OnboardingPreviewProvider } from '@/lib/onboarding/preview-mode';

interface InterceptedEvent {
  kind: string;
  payload: unknown;
  at: string;
}

type Phase = 'onboarding' | 'browse-blocked' | 'browse-unlocked';

export default function RiderFlowClient() {
  const [events, setEvents] = useState<InterceptedEvent[]>([]);
  const [phase, setPhase] = useState<Phase>('onboarding');
  const [resetKey, setResetKey] = useState(0);

  const reset = () => {
    setEvents([]);
    setPhase('onboarding');
    setResetKey(k => k + 1);
  };

  return (
    <OnboardingPreviewProvider
      value={{
        enabled: true,
        onIntercept: (e) =>
          setEvents((prev) => [{ kind: e.kind, payload: e.payload, at: new Date().toISOString() }, ...prev]),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#0a0a0a' }}>
        <PreviewBanner phase={phase} onReset={reset} />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px)', flex: 1, minHeight: 0 }}>
          <div key={`${resetKey}-${phase}`} style={{ overflow: 'auto', borderRight: '1px solid #222', position: 'relative' }}>
            {phase === 'onboarding' ? (
              <RiderOnboarding
                tier="free"
                onComplete={() => setPhase('browse-blocked')}
              />
            ) : (
              // Stand-in for /rider/browse — a static preview-only page so
              // trainers see what's behind the payment blocker. The real
              // /rider/browse pulls live data we don't want to surface here.
              <BrowsePlaceholder unlocked={phase === 'browse-unlocked'} />
            )}

            {phase === 'browse-blocked' && (
              <FirstTimePaymentBlocker
                onSuccess={() => setPhase('browse-unlocked')}
              />
            )}
          </div>

          <aside
            style={{
              overflow: 'auto',
              padding: 16,
              background: '#0d0d0d',
              borderLeft: '1px solid #1f1f1f',
              fontSize: 12,
              color: '#ccc',
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>
              Intercepted events
            </div>
            {events.length === 0 ? (
              <p style={{ color: '#666', fontSize: 12, lineHeight: 1.5 }}>
                Walk through the rider sign-up. The onboarding save (POST{' '}
                <code>/api/users/onboarding</code>) and the Stripe SetupIntent fired by the
                payment blocker are both intercepted — payloads land here.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
                {events.map((e, i) => (
                  <li key={`${e.at}-${i}`} style={{ background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: '#00E676' }}>{e.kind}</span>
                      <span style={{ color: '#666', fontSize: 10 }}>{new Date(e.at).toLocaleTimeString()}</span>
                    </div>
                    <pre style={{ margin: 0, fontSize: 10.5, lineHeight: 1.45, color: '#bbb', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </OnboardingPreviewProvider>
  );
}

function BrowsePlaceholder({ unlocked }: { unlocked: boolean }) {
  return (
    <div style={{ padding: 24, color: '#aaa', minHeight: '100dvh' }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>
        Stand-in for /rider/browse
      </div>
      <h2 style={{ fontSize: 22, color: '#fff', margin: '0 0 8px', fontWeight: 800 }}>
        {unlocked ? 'Browse unlocked — drivers visible' : 'Browse blurred — payment blocker active'}
      </h2>
      <p style={{ fontSize: 13, lineHeight: 1.55, maxWidth: 540 }}>
        In production, <code>/rider/browse</code> renders the driver list here. On the rider&apos;s first
        visit (<code>?firstTime=1</code>), <code>FirstTimePaymentBlocker</code> overlays the page
        until they link a card — exactly what you saw a moment ago.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.55, maxWidth: 540, color: '#666', marginTop: 12 }}>
        We render a placeholder instead of mounting the live <code>/rider/browse</code> page so the
        preview doesn&apos;t pull real driver inventory or fire driver-list analytics.
      </p>
    </div>
  );
}

function PreviewBanner({ phase, onReset }: { phase: Phase; onReset: () => void }) {
  const phaseLabel =
    phase === 'onboarding' ? 'Step 1 · onboarding'
    : phase === 'browse-blocked' ? 'Step 2 · payment blocker'
    : 'Step 3 · browse unlocked';
  return (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(255, 196, 0, 0.95)', color: '#0a0a0a',
        padding: '6px 16px', fontSize: 12, fontWeight: 700,
        letterSpacing: 1, textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}
    >
      <span>Preview · Rider Standard Sign-up · {phaseLabel}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onReset}
          style={{
            background: '#0a0a0a', color: '#ffc400', border: 'none',
            borderRadius: 4, padding: '3px 10px', fontWeight: 700, fontSize: 10,
            letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          Restart
        </button>
        <Link
          href="/admin/flows"
          style={{
            background: 'transparent', color: '#0a0a0a', textDecoration: 'underline',
            fontSize: 10, fontWeight: 700,
          }}
        >
          ← All flows
        </Link>
      </span>
    </div>
  );
}
