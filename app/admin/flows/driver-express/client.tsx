'use client';

// Renders the LIVE DriverOnboardingExpress component wrapped in
// OnboardingPreviewProvider so saves/uploads/analytics short-circuit.
// Same component the production /onboarding?type=driver&mode=express uses,
// so changes ship to both places at once — single source of truth.

import { useState } from 'react';
import Link from 'next/link';
import { DriverOnboardingExpress } from '@/components/onboarding/driver-onboarding-express';
import { OnboardingPreviewProvider } from '@/lib/onboarding/preview-mode';

interface InterceptedEvent {
  kind: string;
  payload: unknown;
  at: string;
}

export default function DriverExpressFlowClient() {
  const [events, setEvents] = useState<InterceptedEvent[]>([]);
  const [resetKey, setResetKey] = useState(0);

  return (
    <OnboardingPreviewProvider
      value={{
        enabled: true,
        onIntercept: (e) =>
          setEvents((prev) => [{ kind: e.kind, payload: e.payload, at: new Date().toISOString() }, ...prev]),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#0a0a0a' }}>
        <PreviewBanner onReset={() => { setResetKey(k => k + 1); setEvents([]); }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px)', flex: 1, minHeight: 0 }}>
          <div key={resetKey} style={{ overflow: 'auto', borderRight: '1px solid #222' }}>
            <DriverOnboardingExpress
              // The live flow's "Make More $$$" button navigates to
              // /driver/profile; in preview we have no profile, so unmount
              // the wrapper instead. Without this the YoureLiveScreen flips
              // to its loading state and spins forever waiting for the nav.
              onComplete={() => { setResetKey(k => k + 1); }}
              tier="free"
            />
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
                Walk through the flow on the left. When the driver would normally save, the
                payload appears here instead of POSTing to <code>/api/users/onboarding</code>.
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

function PreviewBanner({ onReset }: { onReset: () => void }) {
  return (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(255, 196, 0, 0.95)', color: '#0a0a0a',
        padding: '6px 16px', fontSize: 12, fontWeight: 700,
        letterSpacing: 1, textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}
    >
      <span>Preview · Driver Express · No saves, uploads, or analytics</span>
      <span style={{ display: 'flex', gap: 8 }}>
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
