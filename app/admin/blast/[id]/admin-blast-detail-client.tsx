'use client';

// Stream D — admin per-blast detail client.
// Funnel viz + per-driver table + timeline + plain-English summary.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScoreBreakdownBars } from '@/components/blast/score-breakdown-bars';
import { PulseOnMount, ShimmerSlot, StaggeredList } from '@/components/blast/motion';

interface Detail {
  blast: {
    id: string;
    status: string;
    marketSlug: string | null;
    marketName: string | null;
    priceDollars: number;
    pickupAddress: string | null;
    dropoffAddress: string | null;
    tripType: string | null;
    scheduledFor: string | null;
    createdAt: string;
    bumpCount: number;
    rewardFunction: string | null;
  };
  candidates: Array<{
    id: string; driverId: string; score: number | null; wasNotified: boolean;
    filterResults: Array<{ filter?: string; passed?: boolean; value?: unknown; threshold?: unknown }>;
  }>;
  targets: Array<{
    id: string; driverId: string; displayName: string;
    matchScore: number; scoreBreakdown: Record<string, number>;
    notifiedAt: string | null; notificationChannels: string[];
    hmuAt: string | null; counterPrice: number | null;
    passedAt: string | null; selectedAt: string | null; pullUpAt: string | null;
  }>;
  events: Array<{
    id: string; driverId: string; eventType: string;
    eventData: Record<string, unknown> | null;
    source: string; occurredAt: string;
  }>;
  summary: string;
}

export function AdminBlastDetailClient({ blastId }: { blastId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/blast/${blastId}`);
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? 'Blast not found.' : 'Could not load.');
          return;
        }
        const body = await res.json();
        if (!cancelled) setDetail(body);
      } catch {
        if (!cancelled) setError('Network error.');
      }
    })();
    return () => { cancelled = true; };
  }, [blastId]);

  if (error) return <div style={{ padding: 24, color: '#FF8A8A' }}>{error}</div>;
  if (!detail) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ShimmerSlot height={64} radius={12} />
        <ShimmerSlot height={120} radius={16} />
        <ShimmerSlot height={300} radius={16} />
      </div>
    );
  }

  const { blast, candidates, targets, events, summary } = detail;
  const funnel = computeFunnel(candidates, targets);

  return (
    <div style={{ padding: 24, color: '#fff', fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      <Link href="/admin/blast" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, textDecoration: 'none' }}>
        ← Back to all blasts
      </Link>
      <h1 style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 32, margin: '12px 0 4px' }}>
        Blast {blast.id.slice(0, 8)}
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 16px', fontSize: 14 }}>
        {blast.marketName ?? blast.marketSlug ?? 'Unknown market'} • {new Date(blast.createdAt).toLocaleString()} •{' '}
        <span style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", color: '#00E676' }}>${blast.priceDollars}</span>{' '}
        • {blast.status}
      </p>

      {/* Summary */}
      <Card title="Why this match">
        <p style={{ margin: 0, lineHeight: 1.5 }}>{summary}</p>
      </Card>

      {/* Funnel */}
      <Card title="Funnel">
        <Funnel stages={funnel} />
      </Card>

      {/* Targets table */}
      <Card title={`Drivers (${targets.length})`}>
        {targets.length === 0 ? (
          <p style={MUTED}>No targets recorded for this blast.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.55)' }}>
                  {['Driver', 'Score', 'Notify', 'SMS', 'Impr.', 'Viewed', 'Response'].map((h) => (
                    <th key={h} style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => {
                  const driverEvents = events.filter((e) => e.driverId === t.driverId);
                  const smsSent = driverEvents.find((e) => e.eventType === 'sms_sent');
                  const smsDelivered = driverEvents.find((e) => e.eventType === 'sms_delivered');
                  const smsFailed = driverEvents.find((e) => e.eventType === 'sms_failed');
                  const impression = driverEvents.find((e) => e.eventType === 'feed_impression');
                  const offerView = driverEvents.find((e) => e.eventType === 'offer_page_viewed');
                  const expanded = expandedRow === t.id;
                  return (
                    <>
                      <tr key={t.id}
                        onClick={() => setExpandedRow(expanded ? null : t.id)}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                      >
                        <td style={CELL}>{t.displayName}</td>
                        <td style={{ ...CELL, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                          {t.matchScore.toFixed(2)}
                        </td>
                        <td style={CELL}>{t.notifiedAt ? '✓' : '—'}</td>
                        <td style={CELL}>
                          {smsFailed ? '✗ failed' : smsDelivered ? '✓ delivered' : smsSent ? '→ sent' : '—'}
                        </td>
                        <td style={CELL}>{impression ? '✓' : '—'}</td>
                        <td style={CELL}>{offerView ? '✓' : '—'}</td>
                        <td style={CELL}>
                          {t.pullUpAt ? <Pill color="#A855F7">PULL UP</Pill>
                            : t.selectedAt ? <Pill color="#448AFF">SELECTED</Pill>
                              : t.counterPrice ? <Pill color="#FFB300">COUNTER ${t.counterPrice}</Pill>
                                : t.hmuAt ? <Pill color="#00E676">HMU</Pill>
                                  : t.passedAt ? <Pill color="#888">PASS</Pill>
                                    : t.notifiedAt ? <Pill color="#888">PENDING</Pill>
                                      : <Pill color="#888">—</Pill>}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${t.id}-detail`}>
                          <td colSpan={7} style={{ padding: '12px 8px', background: 'rgba(255,255,255,0.02)' }}>
                            <ScoreBreakdownBars
                              breakdown={t.scoreBreakdown}
                              totalScore={t.matchScore}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Timeline */}
      <Card title={`Event Timeline (${events.length})`}>
        {events.length === 0 ? (
          <p style={MUTED}>No events recorded yet.</p>
        ) : (
          <StaggeredList staggerMs={40}>
            {events.map((e) => (
              <PulseOnMount key={e.id}>
                <div style={{
                  display: 'flex', gap: 12, alignItems: 'baseline',
                  padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  fontSize: 13,
                }}>
                  <span style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)", color: 'rgba(255,255,255,0.4)', width: 80, flexShrink: 0 }}>
                    {new Date(e.occurredAt).toLocaleTimeString()}
                  </span>
                  <span style={{ color: '#00E676', fontWeight: 600, width: 160, flexShrink: 0 }}>
                    {e.eventType}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, width: 120, flexShrink: 0 }}>
                    {e.source}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                    {(e.driverId as string).slice(0, 8)}
                  </span>
                </div>
              </PulseOnMount>
            ))}
          </StaggeredList>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      padding: 20, borderRadius: 16, marginTop: 16,
      background: '#141414', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.78)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 100, background: `${color}22`, color,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    }}>{children}</span>
  );
}

function computeFunnel(
  candidates: Detail['candidates'],
  targets: Detail['targets'],
) {
  const total = candidates.length;
  const passedFilters = candidates.filter((c) =>
    Array.isArray(c.filterResults)
      ? c.filterResults.every((f) => f.passed !== false)
      : true,
  ).length;
  const notified = targets.filter((t) => t.notifiedAt).length;
  const responded = targets.filter((t) => t.hmuAt || t.counterPrice || t.passedAt).length;
  const selected = targets.filter((t) => t.selectedAt).length;
  const pulled = targets.filter((t) => t.pullUpAt).length;
  return [
    { label: 'Pool', count: total, color: '#888' },
    { label: 'Passed Filters', count: passedFilters, color: '#FFB300' },
    { label: 'Notified', count: notified, color: '#448AFF' },
    { label: 'Responded', count: responded, color: '#00E676' },
    { label: 'Selected', count: selected, color: '#A855F7' },
    { label: 'Pull Up', count: pulled, color: '#A855F7' },
  ];
}

function Funnel({ stages }: { stages: Array<{ label: string; count: number; color: string }> }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <StaggeredList staggerMs={80}>
      {stages.map((s) => {
        const pct = (s.count / max) * 100;
        return (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <span style={{ width: 120, fontSize: 12, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>
              {s.label}
            </span>
            <div style={{ flex: 1, height: 22, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: s.color,
                transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
              }} />
            </div>
            <span style={{ width: 40, textAlign: 'right', fontFamily: "var(--font-mono, 'Space Mono', monospace)", fontWeight: 700 }}>
              {s.count}
            </span>
          </div>
        );
      })}
    </StaggeredList>
  );
}

const CELL: React.CSSProperties = { padding: '10px 8px', verticalAlign: 'top' };
const MUTED: React.CSSProperties = { color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 };
