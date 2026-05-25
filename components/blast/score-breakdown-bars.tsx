'use client';

// ScoreBreakdownBars — horizontal stacked bar visualizing how a driver's
// match score decomposes across signal categories. Per docs/BLAST-V3-AGENT-
// CONTRACT.md §5.4. Built ONCE in Gate 2.3; consumed by Stream D's per-driver
// admin row + Stream E's simulator panel.
//
// Segment colors map to signal category:
//   Proximity (proximity_to_pickup, last_location_recency): green #00E676
//   Trust    (rating, chill_score, completed_rides):       blue  #448AFF
//   Preference (sex_match):                                 purple #A855F7
//   Behavioral (recency_signin, low_recent_pass_rate,
//               profile_view_count):                        amber #FFB300
//   Unknown:                                               gray
//
// Hover (or whileTap on mobile) reveals tooltip with signal name + raw value
// + weight + contribution. Below the bar: total score in Space Mono,
// right-aligned. 400ms ease-out draw-in, segments stagger 50ms.

import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface ScoreBreakdownBarsProps {
  /** signalKey → contribution. Negative values are clamped to 0. */
  breakdown: Record<string, number>;
  totalScore: number;
  /** Optional configured weight per signal, surfaced in the tooltip. */
  weights?: Record<string, number>;
  /** Optional raw feature values per signal, surfaced in the tooltip. */
  rawValues?: Record<string, number>;
  className?: string;
  /** Bar height in px. Default 12. */
  height?: number;
}

const COLOR_PROXIMITY = '#00E676';
const COLOR_TRUST = '#448AFF';
const COLOR_PREFERENCE = '#A855F7';
const COLOR_BEHAVIORAL = '#FFB300';
const COLOR_UNKNOWN = '#888888';

const PROXIMITY_KEYS = new Set(['proximity_to_pickup', 'last_location_recency']);
const TRUST_KEYS = new Set(['rating', 'chill_score', 'completed_rides']);
const PREFERENCE_KEYS = new Set(['sex_match']);
const BEHAVIORAL_KEYS = new Set(['recency_signin', 'low_recent_pass_rate', 'profile_view_count', 'advance_notice_fit']);

function colorFor(signalKey: string): string {
  if (PROXIMITY_KEYS.has(signalKey)) return COLOR_PROXIMITY;
  if (TRUST_KEYS.has(signalKey)) return COLOR_TRUST;
  if (PREFERENCE_KEYS.has(signalKey)) return COLOR_PREFERENCE;
  if (BEHAVIORAL_KEYS.has(signalKey)) return COLOR_BEHAVIORAL;
  return COLOR_UNKNOWN;
}

function humanizeKey(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface Segment {
  key: string;
  contribution: number;
  pct: number;
  color: string;
}

export function ScoreBreakdownBars({
  breakdown,
  totalScore,
  weights,
  rawValues,
  className,
  height = 12,
}: ScoreBreakdownBarsProps) {
  const prefersReduced = useReducedMotion();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const segments = useMemo<Segment[]>(() => {
    const entries = Object.entries(breakdown).map(([k, v]) => [k, Math.max(0, v)] as const);
    const sum = entries.reduce((acc, [, v]) => acc + v, 0);
    if (sum === 0) return [];
    return entries
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({
        key: k,
        contribution: v,
        pct: (v / sum) * 100,
        color: colorFor(k),
      }));
  }, [breakdown]);

  return (
    <div className={className}>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height,
          borderRadius: height / 2,
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.06)',
        }}
        role="img"
        aria-label={`Score breakdown across ${segments.length} signals; total ${totalScore.toFixed(2)}`}
      >
        {segments.map((seg, idx) => (
          <motion.button
            key={seg.key}
            type="button"
            onMouseEnter={() => setActiveIdx(idx)}
            onMouseLeave={() => setActiveIdx((a) => (a === idx ? null : a))}
            onFocus={() => setActiveIdx(idx)}
            onBlur={() => setActiveIdx((a) => (a === idx ? null : a))}
            onClick={() => setActiveIdx((a) => (a === idx ? null : idx))}
            initial={prefersReduced ? { opacity: 0 } : { width: 0 }}
            animate={prefersReduced ? { opacity: 1 } : { width: `${seg.pct}%` }}
            transition={
              prefersReduced
                ? { duration: 0.2 }
                : { duration: 0.4, delay: idx * 0.05, ease: 'easeOut' }
            }
            style={{
              width: prefersReduced ? `${seg.pct}%` : undefined,
              height,
              background: seg.color,
              border: 0,
              padding: 0,
              cursor: 'pointer',
              outline: 'none',
            }}
            aria-label={`${humanizeKey(seg.key)} contributes ${seg.contribution.toFixed(2)}`}
          />
        ))}
      </div>

      {/* Tooltip */}
      {activeIdx !== null && segments[activeIdx] ? (
        <div
          role="tooltip"
          style={{
            marginTop: 8,
            padding: '8px 10px',
            borderRadius: 8,
            background: '#1a1a1a',
            color: '#FFFFFF',
            fontSize: 12,
            border: `1px solid ${segments[activeIdx].color}`,
            display: 'inline-flex',
            flexDirection: 'column',
            gap: 2,
            maxWidth: '100%',
          }}
        >
          <strong style={{ color: segments[activeIdx].color }}>
            {humanizeKey(segments[activeIdx].key)}
          </strong>
          <span>Contribution: {segments[activeIdx].contribution.toFixed(3)}</span>
          {weights && weights[segments[activeIdx].key] !== undefined ? (
            <span>Weight: {weights[segments[activeIdx].key].toFixed(2)}</span>
          ) : null}
          {rawValues && rawValues[segments[activeIdx].key] !== undefined ? (
            <span>Raw value: {rawValues[segments[activeIdx].key].toFixed(2)}</span>
          ) : null}
        </div>
      ) : null}

      {/* Total — Space Mono right-aligned */}
      <div
        style={{
          marginTop: 8,
          textAlign: 'right',
          fontFamily: 'Space Mono, ui-monospace, monospace',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 14,
          color: '#FFFFFF',
        }}
      >
        Score: {totalScore.toFixed(3)}
      </div>
    </div>
  );
}

export default ScoreBreakdownBars;
