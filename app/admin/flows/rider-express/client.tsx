'use client';

// Rider — Express (Chat Booking) flow preview. Mounts the live
// ExpressRiderOnboarding inside OnboardingPreviewProvider so the name save,
// photo upload, and Stripe SetupIntent all short-circuit. Twin of the
// driver-express preview surface; same layout + intercept panel.

import { useState } from 'react';
import Link from 'next/link';
import { ExpressRiderOnboarding } from '@/components/onboarding/express-rider-onboarding';
import { OnboardingPreviewProvider } from '@/lib/onboarding/preview-mode';

interface InterceptedEvent {
  kind: string;
  payload: unknown;
  at: string;
}

export default function RiderExpressFlowClient() {
  const [events, setEvents] = useState<InterceptedEvent[]>([]);
  const [resetKey, setResetKey] = useState(0);
  // The live flow branches on isCash (cash rides skip the payment step).
  // Expose both so trainers can walk through either path.
  const [isCash, setIsCash] = useState(false);

  return (
    <OnboardingPreviewProvider
      value={{
        enabled: true,
        onIntercept: (e) =>
          setEvents((prev) => [{ kind: e.kind, payload: e.payload, at: new Date().toISOString() }, ...prev]),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#0a0a0a' }}>
        <PreviewBanner
          isCash={isCash}
          onToggleCash={() => { setIsCash(c => !c); setResetKey(k => k + 1); setEvents([]); }}
          onReset={() => { setResetKey(k => k + 1); setEvents([]); }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px)', flex: 1, minHeight: 0 }}>
          <div key={`${resetKey}-${isCash ? 'cash' : 'card'}`} style={{ overflow: 'auto', borderRight: '1px solid #222' }}>
            <ExpressRiderOnboarding
              isCash={isCash}
              onComplete={() => { setResetKey(k => k + 1); }}
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
                Walk the rider through the flow. Saves to <code>/api/users/onboarding</code>,
                photo uploads to <code>/api/upload/video</code>, and Stripe SetupIntent are all
                stubbed — payloads land here instead.
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

function PreviewBanner({
  isCash,
  onToggleCash,
  onReset,
}: {
  isCash: boolean;
  onToggleCash: () => void;
  onReset: () => void;
}) {
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
      <span>Preview · Rider Chat Booking ({isCash ? 'cash ride' : 'card ride'}) · Legacy variant — only fires from /d/{`{handle}`}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onToggleCash}
          style={{
            background: '#0a0a0a', color: '#ffc400', border: 'none',
            borderRadius: 4, padding: '3px 10px', fontWeight: 700, fontSize: 10,
            letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer',
          }}
          title="Cash rides skip the payment step in the live flow"
        >
          Switch to {isCash ? 'card' : 'cash'}
        </button>
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
