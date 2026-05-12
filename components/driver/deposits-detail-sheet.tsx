'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { CountUp } from '@/components/shared/count-up';
import { posthog } from '@/components/analytics/posthog-provider';

interface Props {
  open: boolean;
  onClose: () => void;
  totalDeposits: number;
  rides: number;
  bucket?: 'week' | 'month';
  onBucketChange?: (b: 'week' | 'month') => void;
  // When true, skip the network and render the baked-in mock series.
  // Used by /debug/deposits for an unauthenticated demo of the UI.
  previewMode?: boolean;
}

interface Bucket {
  label: string;
  periodStart: string;
  amount: number;
  rides: number;
  avg: number;
}

interface SeriesResponse {
  bucket: 'week' | 'month';
  window: number;
  series: Bucket[];
  total: number;
  rides: number;
  nonZeroBuckets: number;
}

const COLOR_DEPOSIT = '#00E676';
const COLOR_TREND = '#FFB300';

// Mock series for the preview page. Deterministic so /debug/deposits is stable.
const MOCK_WEEKS: number[] = [124, 188, 162, 247, 296, 341];
const MOCK_MONTHS: number[] = [412, 580, 690, 822, 945, 1108];

function buildMockBuckets(raw: number[], unit: 'week' | 'month'): Bucket[] {
  const movingWindow = 3;
  return raw.map((amount, i) => {
    const start = Math.max(0, i - (movingWindow - 1));
    const slice = raw.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    const ridesEstimate = Math.max(1, Math.round(amount / 18));
    const label = unit === 'week' ? `W${i + 1}` : `M${i + 1}`;
    return {
      label,
      periodStart: '',
      amount,
      rides: ridesEstimate,
      avg: Math.round(avg),
    };
  });
}

export default function DepositsDetailSheet({
  open,
  onClose,
  totalDeposits,
  rides,
  bucket = 'week',
  onBucketChange,
  previewMode = false,
}: Props) {
  const [data, setData] = useState<Bucket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset + refetch every time the sheet opens or the bucket flips.
  useEffect(() => {
    if (!open) return;

    if (previewMode) {
      setData(buildMockBuckets(bucket === 'week' ? MOCK_WEEKS : MOCK_MONTHS, bucket));
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/driver/earnings/series?bucket=${bucket}&window=6`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SeriesResponse>;
      })
      .then(json => {
        if (cancelled) return;
        setData(json.series);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, bucket, previewMode]);

  const totals = useMemo(() => {
    if (!data || !data.length) return null;
    const sum = data.reduce((s, d) => s + d.amount, 0);
    const best = data.reduce((m, d) => (d.amount > m.amount ? d : m), data[0]);
    const latest = data[data.length - 1];
    const prior = data.slice(-5, -1).filter(d => d.amount > 0);
    const priorAvg = prior.length
      ? prior.reduce((s, d) => s + d.amount, 0) / prior.length
      : 0;
    const delta = priorAvg > 0 ? ((latest.amount - priorAvg) / priorAvg) * 100 : 0;
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].amount > 0) streak++;
      else break;
    }
    const nonZero = data.filter(d => d.amount > 0).length;
    return { sum, best, latest, priorAvg, delta, streak, nonZero };
  }, [data]);

  const heroTotal = totalDeposits > 0
    ? totalDeposits
    : (totals?.sum ?? 0);
  const heroRides = rides > 0
    ? rides
    : (data?.reduce((s, d) => s + d.rides, 0) ?? 0);

  // We don't want a stub chart at week 1. ≥2 buckets with deposits = chart.
  // Anything below that gets a "your story starts here" hero instead.
  const showChart = !!totals && totals.nonZero >= 2;

  const handleBucket = (b: 'week' | 'month') => {
    if (b === bucket) return;
    if (!previewMode) posthog.capture('deposits_sheet_bucket_toggled', { to: b });
    onBucketChange?.(b);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              zIndex: 90,
            }}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label="Your deposits detail"
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0,
              background: '#0a0a0a',
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              borderTop: '1px solid rgba(0,230,118,0.15)',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
              padding: '12px 20px 28px',
              maxHeight: '90vh', overflowY: 'auto',
              zIndex: 100,
            }}
          >
            <div style={{
              width: 44, height: 5, borderRadius: 100,
              background: 'rgba(255,255,255,0.15)',
              margin: '0 auto 16px',
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{
                  fontFamily: "var(--font-mono, 'Space Mono', monospace)",
                  fontSize: 10, color: '#00E676',
                  textTransform: 'uppercase', letterSpacing: 2,
                }}>
                  Your Deposits
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  Locked the moment your rider taps <span style={{ color: '#fff', fontWeight: 600 }}>I&apos;m In</span>
                </div>
              </div>
              <button
                aria-label="Close"
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: 100,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#bbb', fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {'✕'}
              </button>
            </div>

            <div style={{
              fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
              fontSize: 64, lineHeight: 1, color: '#00E676',
              letterSpacing: '-0.02em',
              marginTop: 4,
            }}>
              <CountUp
                key={open ? 'open' : 'closed'}
                value={heroTotal}
                decimals={2}
                prefix="$"
                duration={1400}
              />
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4, marginBottom: 20 }}>
              Across {heroRides} {heroRides === 1 ? 'ride' : 'rides'} this period
            </div>

            <div style={{
              display: 'flex', gap: 4,
              background: '#141414',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 100, padding: 4,
              marginBottom: 16,
            }}>
              <BucketBtn label="Weekly" active={bucket === 'week'} onClick={() => handleBucket('week')} />
              <BucketBtn label="Monthly" active={bucket === 'month'} onClick={() => handleBucket('month')} />
            </div>

            {loading && <SheetSkeleton />}

            {!loading && error && (
              <div style={{
                background: 'rgba(255,64,129,0.06)', border: '1px solid rgba(255,64,129,0.18)',
                borderRadius: 12, padding: 14, fontSize: 12, color: '#FF4081', marginBottom: 16,
              }}>
                Couldn&apos;t load your deposit history. {error}
              </div>
            )}

            {!loading && !error && data && (
              showChart ? (
                <ChartBlock data={data} bucket={bucket} totals={totals!} />
              ) : (
                <FirstStepBlock bucket={bucket} latest={data[data.length - 1]} />
              )
            )}

            <div style={{
              fontSize: 11, color: '#666', textAlign: 'center',
              lineHeight: 1.5, padding: '0 8px',
            }}>
              {previewMode
                ? <><span style={{ color: '#888' }}>Mock data shown</span> &middot; live series will read from your deposit history once wired up</>
                : <>Every deposit captures the moment your rider taps <span style={{ color: '#888' }}>I&apos;m In</span>.</>}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function BucketBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 14px', border: 'none', cursor: 'pointer',
        borderRadius: 100, fontSize: 13, fontWeight: 600,
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        background: active ? '#00E676' : 'transparent',
        color: active ? '#080808' : '#888',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      {label}
    </button>
  );
}

interface TotalsShape {
  sum: number;
  best: Bucket;
  latest: Bucket;
  priorAvg: number;
  delta: number;
  streak: number;
  nonZero: number;
}

function ChartBlock({
  data,
  bucket,
  totals,
}: { data: Bucket[]; bucket: 'week' | 'month'; totals: TotalsShape }) {
  return (
    <>
      <div style={{
        background: '#141414', borderRadius: 16, padding: '16px 12px 8px',
        border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
          <div style={{
            fontFamily: "var(--font-mono, 'Space Mono', monospace)",
            fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1.5,
          }}>
            Last 6 {bucket === 'week' ? 'weeks' : 'months'}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#666' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_DEPOSIT }} />
              Deposits
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 2, background: COLOR_TREND, borderRadius: 1 }} />
              Trend
            </span>
          </div>
        </div>

        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#666', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#666', fontSize: 10 }}
                tickFormatter={(v) => `$${v}`}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,230,118,0.06)' }}
                content={<ChartTooltip bucket={bucket} />}
              />
              <Bar
                dataKey="amount"
                fill={COLOR_DEPOSIT}
                radius={[6, 6, 0, 0]}
                animationDuration={900}
                animationEasing="ease-out"
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.amount === 0 ? 'rgba(255,255,255,0.06)' : COLOR_DEPOSIT} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="avg"
                stroke={COLOR_TREND}
                strokeWidth={2}
                dot={{ r: 3, fill: COLOR_TREND, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                animationDuration={1200}
                animationBegin={400}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <StoryPill
          label={`Best ${bucket === 'week' ? 'Week' : 'Month'}`}
          value={`$${totals.best.amount.toFixed(0)}`}
          accent={COLOR_DEPOSIT}
        />
        <StoryPill
          label={`vs Prior ${bucket === 'week' ? '4 wks' : '4 mos'}`}
          value={totals.priorAvg > 0 ? `${totals.delta >= 0 ? '+' : ''}${totals.delta.toFixed(0)}%` : '—'}
          accent={totals.delta >= 0 ? COLOR_DEPOSIT : '#FF4081'}
        />
        <StoryPill
          label="Active Streak"
          value={`${totals.streak}${bucket === 'week' ? 'w' : 'mo'}`}
          accent="#FFC107"
        />
      </div>
    </>
  );
}

function FirstStepBlock({ bucket, latest }: { bucket: 'week' | 'month'; latest: Bucket | undefined }) {
  const hasAny = latest && latest.amount > 0;
  return (
    <div style={{
      background: '#141414', borderRadius: 16, padding: 24,
      border: '1px solid rgba(0,230,118,0.12)', marginBottom: 16,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }} aria-hidden>
        {hasAny ? '\u{1F331}' : '\u{1F4B5}'}
      </div>
      <div style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 22, color: '#fff', lineHeight: 1.1, marginBottom: 6,
      }}>
        {hasAny
          ? `Your first ${bucket === 'week' ? 'weeks' : 'months'} of deposits`
          : 'Your first deposit lands here'}
      </div>
      <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
        {hasAny
          ? `We'll plot a chart once you have ${bucket === 'week' ? 'two weeks' : 'two months'} of activity. Keep going.`
          : 'Run one digital ride and your earnings curve starts here. Cash rides stay in Your Cash.'}
      </div>
    </div>
  );
}

function SheetSkeleton() {
  return (
    <div style={{
      background: '#141414', borderRadius: 16, padding: 16,
      border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 180 }}>
        {[40, 70, 55, 90, 110, 130].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: h, borderRadius: 6,
              background: 'rgba(0,230,118,0.08)',
              animation: `dds-pulse 1.4s ease-in-out ${i * 0.08}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes dds-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}

function StoryPill({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: '#141414',
      border: `1px solid ${accent}22`,
      borderRadius: 12, padding: '10px 8px',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "var(--font-mono, 'Space Mono', monospace)",
        fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 1,
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: 22, color: accent, lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

interface TooltipPayload {
  active?: boolean;
  payload?: Array<{ payload: Bucket }>;
  bucket: 'week' | 'month';
}

function ChartTooltip({ active, payload, bucket }: TooltipPayload) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: '#080808', border: '1px solid rgba(0,230,118,0.3)',
      borderRadius: 10, padding: '8px 10px', fontSize: 11, color: '#fff', minWidth: 130,
    }}>
      <div style={{ color: '#888', marginBottom: 4, fontWeight: 600 }}>{d.label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: COLOR_DEPOSIT }}>Deposits</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>${d.amount.toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: COLOR_TREND }}>3-{bucket === 'week' ? 'wk' : 'mo'} avg</span>
        <span style={{ fontFamily: "'Space Mono', monospace" }}>${d.avg.toFixed(2)}</span>
      </div>
      <div style={{ color: '#666', fontSize: 10, marginTop: 4 }}>
        {d.rides} {d.rides === 1 ? 'ride' : 'rides'}
      </div>
    </div>
  );
}
