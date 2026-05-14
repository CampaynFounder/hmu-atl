'use client';

// Client-side gallery for /dev/blast-motion. All eleven Gate 2.3 motion
// primitives plus the ScoreBreakdownBars component, each with a brief
// description and a live demo. Interactive primitives have explicit
// triggers so streams can poke them.

import { useState } from 'react';
import { MotionConfig } from 'framer-motion';
import {
  NeuralNetworkLoader,
  BottomSheet,
  PulseOnMount,
  SuccessCheckmark,
  CountUpNumber,
  ShimmerSlot,
  SwipeableCard,
  MagneticButton,
  CountdownRing,
  StaggeredList,
  TypingDots,
} from '@/components/blast/motion';
import { ScoreBreakdownBars } from '@/components/blast/score-breakdown-bars';

interface SectionProps {
  title: string;
  spec: string;
  children: React.ReactNode;
}

function Section({ title, spec, children }: SectionProps) {
  return (
    <section
      style={{
        background: '#141414',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <header>
        <h2 style={{ margin: 0, fontSize: 16, color: '#FFFFFF' }}>{title}</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888888' }}>{spec}</p>
      </header>
      {children}
    </section>
  );
}

function ReducedMotionWrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        background: '#0a0a0a',
        border: '1px dashed rgba(255, 255, 255, 0.12)',
      }}
    >
      <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Reduced-motion variant</div>
      <MotionConfig reducedMotion="always">{children}</MotionConfig>
    </div>
  );
}

export function BlastMotionGallery() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [counter, setCounter] = useState(25);
  const [showCheck, setShowCheck] = useState(false);
  const [seconds, setSeconds] = useState(720);
  const [swipeMsg, setSwipeMsg] = useState<string | null>(null);

  const breakdown = {
    proximity_to_pickup: 0.27,
    recency_signin: 0.12,
    sex_match: 0.09,
    chill_score: 0.08,
    advance_notice_fit: 0.06,
    profile_view_count: 0.04,
    completed_rides: 0.05,
    low_recent_pass_rate: 0.05,
  };
  const weights = {
    proximity_to_pickup: 0.30,
    recency_signin: 0.15,
    sex_match: 0.15,
    chill_score: 0.10,
    advance_notice_fit: 0.10,
    profile_view_count: 0.05,
    completed_rides: 0.05,
    low_recent_pass_rate: 0.10,
  };
  const totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return (
    <main
      style={{
        background: '#080808',
        color: '#FFFFFF',
        minHeight: '100vh',
        padding: 24,
        fontFamily: 'DM Sans, system-ui, sans-serif',
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Blast Motion Library</h1>
        <p style={{ margin: '8px 0 0', color: '#888' }}>
          Gate 2.3 — visual reference for every primitive consumed by Streams A/B/C/D/E.
          Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5–§6.6.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        <Section
          title="NeuralNetworkLoader"
          spec="5x5 pulsing node grid + edges. Searching state on rider offer board (§6.3)."
        >
          <NeuralNetworkLoader label="Notifying 7 drivers…" />
          <ReducedMotionWrap>
            <NeuralNetworkLoader label="Notifying 7 drivers…" />
          </ReducedMotionWrap>
        </Section>

        <Section
          title="BottomSheet"
          spec="Drag-dismiss bottom sheet. Drag past 30% of height = close. (§6.4)"
        >
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: '#00E676',
              color: '#000',
              border: 0,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Open sheet
          </button>
          <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} ariaLabel="Demo sheet">
            <div style={{ padding: 24 }}>
              <h3 style={{ marginTop: 0 }}>Demo bottom sheet</h3>
              <p>Drag the handle down to dismiss, or tap the backdrop.</p>
              <button type="button" onClick={() => setSheetOpen(false)}>
                Close
              </button>
            </div>
          </BottomSheet>
        </Section>

        <Section
          title="PulseOnMount"
          spec="scale 0.96 → 1.04 → 1.0 over 600ms; one-shot attention pulse."
        >
          <PulseOnMount key={`pulse-${seconds}`}>
            <div
              style={{
                padding: 12,
                background: '#1a1a1a',
                borderRadius: 8,
                border: '1px solid #00E676',
              }}
            >
              I just mounted!
            </div>
          </PulseOnMount>
          <button
            type="button"
            onClick={() => setSeconds((s) => s + 1)}
            style={{ alignSelf: 'flex-start', padding: 6, marginTop: 4 }}
          >
            Re-mount
          </button>
        </Section>

        <Section title="SuccessCheckmark" spec="Stroke draw-in checkmark; auto-fade after 1.2s.">
          <button
            type="button"
            onClick={() => { setShowCheck(false); setTimeout(() => setShowCheck(true), 50); }}
            style={{ padding: '8px 12px', alignSelf: 'flex-start' }}
          >
            Trigger
          </button>
          {showCheck ? <SuccessCheckmark size={48} onHidden={() => setShowCheck(false)} /> : null}
        </Section>

        <Section title="CountUpNumber" spec="rAF lerp old → new value, 350ms ease-out.">
          <div style={{ fontSize: 32 }}>
            $<CountUpNumber value={counter} formatter={(n) => n.toFixed(2)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setCounter((c) => c - 1)}>−$1</button>
            <button type="button" onClick={() => setCounter((c) => c + 1)}>+$1</button>
            <button type="button" onClick={() => setCounter((c) => c + 10)}>+$10</button>
          </div>
        </Section>

        <Section title="ShimmerSlot" spec="Skeleton w/ left-to-right gradient shimmer.">
          <ShimmerSlot height={20} />
          <ShimmerSlot height={48} radius={12} />
        </Section>

        <Section
          title="SwipeableCard"
          spec="Drag up = HMU, drag down = pass; threshold 30% of card height."
        >
          <SwipeableCard
            onSwipeUp={() => setSwipeMsg('HMU sent ↑')}
            onSwipeDown={() => setSwipeMsg('Passed ↓')}
            ariaLabel="Demo swipe card"
          >
            <div
              style={{
                padding: 16,
                background: '#1a1a1a',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                userSelect: 'none',
                cursor: 'grab',
              }}
            >
              Swipe me up or down
            </div>
          </SwipeableCard>
          {swipeMsg ? <p style={{ color: '#00E676' }}>{swipeMsg}</p> : null}
        </Section>

        <Section title="MagneticButton" spec="Translates ±4px toward cursor on desktop hover.">
          <MagneticButton
            style={{
              padding: '12px 20px',
              borderRadius: 8,
              background: '#00E676',
              color: '#000',
              border: 0,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Hover me (desktop)
          </MagneticButton>
        </Section>

        <Section
          title="CountdownRing"
          spec="Circular SVG countdown; amber at <5min, red at <1min."
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <CountdownRing secondsRemaining={seconds} totalSeconds={900} label={`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button type="button" onClick={() => setSeconds((s) => Math.max(0, s - 60))}>−1m</button>
              <button type="button" onClick={() => setSeconds((s) => s + 60)}>+1m</button>
              <button type="button" onClick={() => setSeconds(45)}>set 0:45</button>
            </div>
          </div>
        </Section>

        <Section title="StaggeredList" spec="Children enter with 60–100ms cascade.">
          <StaggeredList>
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                style={{
                  padding: 8,
                  background: '#1a1a1a',
                  borderRadius: 6,
                  marginBottom: 4,
                }}
              >
                Item {n}
              </div>
            ))}
          </StaggeredList>
        </Section>

        <Section title="TypingDots" spec="3 dots, opacity cascade 1.2s loop.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Driver typing</span>
            <TypingDots />
          </div>
        </Section>

        <Section title="ScoreBreakdownBars" spec="Stacked horizontal bar; per-category color (§5.4).">
          <ScoreBreakdownBars
            breakdown={breakdown}
            totalScore={totalScore}
            weights={weights}
          />
        </Section>
      </div>
    </main>
  );
}
