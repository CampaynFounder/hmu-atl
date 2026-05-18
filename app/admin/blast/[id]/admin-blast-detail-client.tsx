'use client';

// Stream D — admin per-blast detail client.
// Funnel viz + filter-drop analysis + per-driver score breakdown + timeline.
// Auto-polls every 10s when blast is active.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ScoreBreakdownBars } from '@/components/blast/score-breakdown-bars';
import { PulseOnMount, ShimmerSlot, StaggeredList } from '@/components/blast/motion';
import { DriverLookup } from './driver-lookup';

interface FilterResult {
  filter?: string;
  passed?: boolean;
  value?: unknown;
  threshold?: unknown;
}

interface Candidate {
  id: string;
  driverId: string;
  score: number | null;
  wasNotified: boolean;
  filterResults: FilterResult[];
  rawFeatures: Record<string, number>;
  normalizedFeatures: Record<string, number>;
  configVersion: string | null;
}

interface Target {
  id: string;
  driverId: string;
  displayName: string;
  matchScore: number;
  scoreBreakdown: Record<string, number>;
  notifiedAt: string | null;
  notificationChannels: string[];
  hmuAt: string | null;
  counterPrice: number | null;
  passedAt: string | null;
  selectedAt: string | null;
  pullUpAt: string | null;
}

interface BlastEvent {
  id: string;
  driverId: string;
  eventType: string;
  eventData: Record<string, unknown> | null;
  source: string;
  occurredAt: string;
}

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
    expiresAt: string | null;
    createdAt: string;
    bumpCount: number;
    rewardFunction: string | null;
    counterOfferMaxPct: number | null;
  };
  candidates: Candidate[];
  targets: Target[];
  events: BlastEvent[];
  summary: string;
}

// Map raw feature keys to human-readable labels
const FEATURE_LABELS: Record<string, string> = {
  proximity_to_pickup: 'Proximity to pickup',
  last_location_recency: 'Location recency',
  rating: 'Rating',
  chill_score: 'Chill score',
  completed_rides: 'Completed rides',
  sex_match: 'Gender match',
  recency_signin: 'Recent sign-in',
  low_recent_pass_rate: 'Low pass rate',
  profile_view_count: 'Profile views',
  advance_notice_fit: 'Advance notice fit',
};

function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Human-readable explanation of why a filter failed
function humanizeFilterFail(f: FilterResult): string {
  const name = f.filter ?? 'unknown filter';
  const val = f.value;
  const threshold = f.threshold;

  switch (name) {
    case 'max_proximity_km':
      return `Too far: ${typeof val === 'number' ? val.toFixed(1) : val}km (max ${threshold}km)`;
    case 'min_rating':
      return `Rating too low: ${typeof val === 'number' ? val.toFixed(1) : val} (min ${threshold})`;
    case 'min_chill_score':
      return `Chill score too low: ${val} (min ${threshold})`;
    case 'min_completed_rides':
      return `Not enough rides: ${val} (min ${threshold})`;
    case 'has_active_ride':
      return 'Currently on a ride';
    case 'is_available':
      return 'Marked unavailable';
    case 'sex_match':
      return "Gender preference mismatch";
    case 'has_stripe_account':
      return 'No payout account';
    case 'account_status':
      return `Account status: ${val} (need active)`;
    case 'location_stale':
      return `Location stale: ${typeof val === 'number' ? Math.round(val / 60) + 'min ago' : val}`;
    default:
      return threshold !== undefined
        ? `${featureLabel(name)}: ${val} (threshold: ${threshold})`
        : `${featureLabel(name)}: ${val}`;
  }
}

export function AdminBlastDetailClient({ blastId }: { blastId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const cancelRef = useRef(false);

  const fetchDetail = useCallback(async (silent = false) => {
    cancelRef.current = false;
    try {
      const res = await fetch(`/api/admin/blast/${blastId}`);
      if (!res.ok) {
        if (!cancelRef.current && !silent) setError(res.status === 404 ? 'Blast not found.' : 'Could not load.');
        return;
      }
      const body = await res.json();
      if (!cancelRef.current) {
        setDetail(body);
        setLastPoll(new Date());
      }
    } catch {
      if (!cancelRef.current && !silent) setError('Network error.');
    }
  }, [blastId]);

  // Initial load
  useEffect(() => {
    fetchDetail(false);
    return () => { cancelRef.current = true; };
  }, [fetchDetail]);

  // Auto-poll every 10s while blast is active
  useEffect(() => {
    if (detail?.blast.status !== 'active') return;
    const interval = setInterval(() => fetchDetail(true), 10_000);
    return () => clearInterval(interval);
  }, [detail?.blast.status, fetchDetail]);

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
  const isActive = blast.status === 'active';
  const funnel = computeFunnel(candidates, targets);

  // Build a driverId → rawFeatures map from candidates so we can feed raw
  // values into ScoreBreakdownBars for each notified target.
  const rawByDriver = Object.fromEntries(
    candidates.map((c) => [c.driverId, c.rawFeatures ?? {}]),
  );

  // Filter-drop analysis: candidates who failed ≥1 filter
  const dropped = candidates.filter((c) =>
    Array.isArray(c.filterResults) && c.filterResults.some((f) => f.passed === false),
  );

  // Group dropped by which filter they failed (pick first failure)
  const byFilter: Record<string, { count: number; examples: Array<{ driverId: string; reason: string }> }> = {};
  for (const c of dropped) {
    const failed = c.filterResults.filter((f) => f.passed === false);
    for (const f of failed) {
      const key = f.filter ?? 'unknown';
      if (!byFilter[key]) byFilter[key] = { count: 0, examples: [] };
      byFilter[key].count++;
      if (byFilter[key].examples.length < 3) {
        byFilter[key].examples.push({ driverId: c.driverId, reason: humanizeFilterFail(f) });
      }
    }
  }
  const filterEntries = Object.entries(byFilter).sort((a, b) => b[1].count - a[1].count);

  // Expires countdown
  let expiresLabel: string | null = null;
  if (blast.expiresAt) {
    const delta = new Date(blast.expiresAt).getTime() - Date.now();
    if (delta > 0) {
      const mins = Math.ceil(delta / 60000);
      expiresLabel = mins < 60 ? `${mins}m left` : `${Math.ceil(mins / 60)}h left`;
    } else {
      expiresLabel = 'expired';
    }
  }

  return (
    <div style={{ padding: 24, color: '#fff', fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/admin/blast" style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, textDecoration: 'none' }}>
          ← Blast Monitor
        </Link>
        {isActive && lastPoll && (
          <span style={{ fontSize: 11, color: '#00E676', marginLeft: 'auto' }}>
            Live · updated {new Date(lastPoll).toLocaleTimeString()}
          </span>
        )}
      </div>

      <h1 style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", fontSize: 32, margin: '12px 0 4px' }}>
        Blast {blast.id.slice(0, 8)}
        {isActive && <span style={{ fontSize: 14, fontWeight: 400, color: '#00E676', marginLeft: 12, verticalAlign: 'middle' }}>● LIVE</span>}
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 4px', fontSize: 14 }}>
        {blast.marketName ?? blast.marketSlug ?? 'Unknown market'}
        {' · '}{new Date(blast.createdAt).toLocaleString()}
        {' · '}<span style={{ fontFamily: "'Space Mono', monospace", color: '#00E676' }}>${blast.priceDollars}</span>
        {' · '}{blast.status}
        {expiresLabel && <span style={{ color: expiresLabel === 'expired' ? '#FF4444' : 'rgba(255,255,255,0.45)', marginLeft: 8 }}>{expiresLabel}</span>}
      </p>
      {blast.pickupAddress && (
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', fontSize: 13 }}>
          {blast.pickupAddress} → {blast.dropoffAddress ?? 'TBD'}
        </p>
      )}

      {/* Summary */}
      <Card title="Why this match">
        <p style={{ margin: 0, lineHeight: 1.6 }}>{summary}</p>
        {blast.rewardFunction && (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Reward function: <span style={{ fontFamily: "'Space Mono', monospace", color: '#FFB300' }}>{blast.rewardFunction}</span>
            {blast.counterOfferMaxPct != null && (
              <> · Counter offer max: {blast.counterOfferMaxPct}%</>
            )}
          </p>
        )}
      </Card>

      {/* Funnel */}
      <Card title="Funnel">
        <Funnel stages={funnel} />
      </Card>

      {/* Algorithm thinking — filter drops */}
      {candidates.length > 0 && (
        <Card title={`Algorithm thinking — ${dropped.length} of ${candidates.length} drivers filtered out`}>
          <ScoreSignalLegend />
          {filterEntries.length === 0 ? (
            <p style={MUTED}>All {candidates.length} candidates passed every filter.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {filterEntries.map(([filter, { count, examples }]) => (
                <div key={filter} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 100, background: 'rgba(255,68,68,0.18)',
                      color: '#FF8A8A', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    }}>
                      {featureLabel(filter)}
                    </span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      knocked out {count} driver{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {examples.map((ex, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', padding: '2px 0 2px 8px', borderLeft: '2px solid rgba(255,68,68,0.3)' }}>
                      <span style={{ fontFamily: "'Space Mono', monospace", color: 'rgba(255,255,255,0.35)', marginRight: 8 }}>
                        {ex.driverId.slice(0, 8)}
                      </span>
                      {ex.reason}
                    </div>
                  ))}
                  {count > 3 && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4, paddingLeft: 8 }}>
                      +{count - 3} more
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Notified drivers — click row to expand score breakdown */}
      <Card title={`Notified drivers (${targets.length}) — click row to see score breakdown`}>
        {targets.length === 0 ? (
          <p style={MUTED}>No targets recorded for this blast yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'rgba(255,255,255,0.55)' }}>
                  {['Driver', 'Score', 'SMS', 'Impression', 'Offer Viewed', 'Response'].map((h) => (
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
                  const rawValues = rawByDriver[t.driverId] ?? {};
                  return (
                    <>
                      <tr
                        key={t.id}
                        onClick={() => setExpandedRow(expanded ? null : t.id)}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}
                      >
                        <td style={CELL}>{t.displayName}</td>
                        <td style={{ ...CELL, fontFamily: "'Space Mono', monospace", color: '#FFB300' }}>
                          {t.matchScore.toFixed(3)}
                        </td>
                        <td style={CELL}>
                          {smsFailed
                            ? <Pill color="#FF4444">✗ failed</Pill>
                            : smsDelivered
                            ? <Pill color="#00E676">✓ delivered</Pill>
                            : smsSent
                            ? <Pill color="#448AFF">→ sent</Pill>
                            : '—'}
                        </td>
                        <td style={CELL}>{impression ? <Pill color="#448AFF">✓</Pill> : '—'}</td>
                        <td style={CELL}>{offerView ? <Pill color="#A855F7">✓</Pill> : '—'}</td>
                        <td style={CELL}>
                          {t.pullUpAt ? <Pill color="#A855F7">PULL UP</Pill>
                            : t.selectedAt ? <Pill color="#448AFF">SELECTED</Pill>
                              : t.counterPrice != null ? <Pill color="#FFB300">COUNTER ${t.counterPrice}</Pill>
                                : t.hmuAt ? <Pill color="#00E676">HMU</Pill>
                                  : t.passedAt ? <Pill color="#888">PASS</Pill>
                                    : t.notifiedAt ? <Pill color="#888">PENDING</Pill>
                                      : <Pill color="#888">—</Pill>}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${t.id}-expand`}>
                          <td colSpan={6} style={{ padding: '16px 12px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ maxWidth: 520 }}>
                              <ScoreBreakdownBars
                                breakdown={t.scoreBreakdown}
                                totalScore={t.matchScore}
                                rawValues={rawValues}
                                height={16}
                              />
                              {Object.keys(rawValues).length > 0 && (
                                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                                  {Object.entries(rawValues).map(([k, v]) => (
                                    <span key={k} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>{featureLabel(k)}: </span>
                                      <span style={{ fontFamily: "'Space Mono', monospace", color: 'rgba(255,255,255,0.7)' }}>
                                        {typeof v === 'number' ? v.toFixed(3) : String(v)}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
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

      {/* Driver lookup */}
      <Card title="Driver lookup — where did this driver fall out?">
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          Search any driver by name or handle to see exactly where they were excluded from this blast.
        </p>
        <DriverLookup blastId={blast.id} />
      </Card>

      {/* Event timeline */}
      <Card title={`Event timeline (${events.length})`}>
        {events.length === 0 ? (
          <p style={MUTED}>No events recorded yet.</p>
        ) : (
          <StaggeredList staggerMs={30}>
            {events.map((e) => (
              <PulseOnMount key={e.id}>
                <div style={{
                  display: 'flex', gap: 10, alignItems: 'baseline',
                  padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  fontSize: 13,
                }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", color: 'rgba(255,255,255,0.35)', width: 80, flexShrink: 0, fontSize: 11 }}>
                    {new Date(e.occurredAt).toLocaleTimeString()}
                  </span>
                  <span style={{ color: '#00E676', fontWeight: 600, width: 180, flexShrink: 0 }}>
                    {e.eventType}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, width: 100, flexShrink: 0 }}>
                    {e.source}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                    {e.driverId.slice(0, 8)}
                  </span>
                  {e.eventData && Object.keys(e.eventData).length > 0 && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'Space Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {JSON.stringify(e.eventData).slice(0, 80)}
                    </span>
                  )}
                </div>
              </PulseOnMount>
            ))}
          </StaggeredList>
        )}
      </Card>
    </div>
  );
}

// Color-coded signal legend for the score breakdown
function ScoreSignalLegend() {
  const items = [
    { color: '#00E676', label: 'Proximity', signals: 'proximity to pickup · location recency' },
    { color: '#448AFF', label: 'Trust', signals: 'rating · chill score · ride history' },
    { color: '#A855F7', label: 'Preference', signals: 'gender match' },
    { color: '#FFB300', label: 'Behavioral', signals: 'recent sign-in · pass rate · profile views' },
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginBottom: 4 }}>
      {items.map(({ color, label, signals }) => (
        <span key={label} title={signals} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)', cursor: 'default' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
          {label}
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>({signals})</span>
        </span>
      ))}
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
      padding: '2px 8px', borderRadius: 100, background: `${color}22`, color,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
    }}>{children}</span>
  );
}

function computeFunnel(candidates: Candidate[], targets: Target[]) {
  const total = candidates.length;
  const passedFilters = candidates.filter((c) =>
    Array.isArray(c.filterResults)
      ? c.filterResults.every((f) => f.passed !== false)
      : true,
  ).length;
  const notified = targets.filter((t) => t.notifiedAt).length;
  const responded = targets.filter((t) => t.hmuAt || t.counterPrice != null || t.passedAt).length;
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
              <div style={{ width: `${pct}%`, height: '100%', background: s.color, transition: 'width 400ms cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
            <span style={{ width: 40, textAlign: 'right', fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
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
