'use client';

// Driver lookup panel for the blast detail page.
// Lets an operator search by name/handle to see exactly where a driver
// fell out of the matching pipeline for this specific blast.

import { useCallback, useEffect, useRef, useState } from 'react';

interface PrePoolCheck {
  label: string;
  passed: boolean;
  detail: string;
}

interface FilterResult {
  filter?: string;
  passed?: boolean;
  value?: unknown;
  threshold?: unknown;
}

interface DriverResult {
  driver: {
    id: string;
    displayName: string;
    handle: string | null;
    avatarUrl: string | null;
  };
  status: 'notified' | 'in_pool_filtered' | 'in_pool_not_notified' | 'not_in_pool';
  response: 'pull_up' | 'selected' | 'hmu' | 'counter' | 'pass' | 'pending' | null;
  score: number | null;
  scoreBreakdown: Record<string, number>;
  filterResults: FilterResult[];
  prePoolChecks: PrePoolCheck[];
}

const STATUS_LABELS: Record<DriverResult['status'], string> = {
  notified: 'NOTIFIED',
  in_pool_filtered: 'FILTERED',
  in_pool_not_notified: 'NOT NOTIFIED',
  not_in_pool: 'NOT IN POOL',
};

const STATUS_COLORS: Record<DriverResult['status'], string> = {
  notified: '#448AFF',
  in_pool_filtered: '#FF8A8A',
  in_pool_not_notified: '#FFB300',
  not_in_pool: '#888',
};

const RESPONSE_COLORS: Record<string, string> = {
  pull_up: '#A855F7',
  selected: '#448AFF',
  hmu: '#00E676',
  counter: '#FFB300',
  pass: '#888',
  pending: '#555',
};

export function DriverLookup({ blastId }: { blastId: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DriverResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef(false);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    cancelRef.current = false;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blast/${blastId}/driver-lookup?q=${encodeURIComponent(q)}`);
      if (!cancelRef.current) {
        if (res.ok) {
          const body = await res.json();
          setResults(body.drivers ?? []);
        } else {
          setResults([]);
        }
      }
    } catch {
      if (!cancelRef.current) setResults([]);
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [blastId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      cancelRef.current = true;
    };
  }, [query, search]);

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search driver by name or handle…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#fff', fontSize: 14, outline: 'none',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        />
        {loading && (
          <span style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 11, color: 'rgba(255,255,255,0.4)',
          }}>
            searching…
          </span>
        )}
      </div>

      {results !== null && results.length === 0 && !loading && query.length >= 2 && (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 12 }}>
          No drivers found matching &ldquo;{query}&rdquo;
        </p>
      )}

      {results && results.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((r) => {
            const isExpanded = expanded === r.driver.id;
            const statusColor = STATUS_COLORS[r.status];
            const hasDetail = r.filterResults.length > 0 || r.prePoolChecks.length > 0;
            return (
              <div
                key={r.driver.id}
                style={{
                  borderRadius: 10, border: `1px solid ${isExpanded ? `${statusColor}44` : 'rgba(255,255,255,0.08)'}`,
                  background: isExpanded ? `${statusColor}08` : '#1a1a1a',
                  overflow: 'hidden',
                }}
              >
                {/* Summary row */}
                <div
                  onClick={() => hasDetail && setExpanded(isExpanded ? null : r.driver.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    cursor: hasDetail ? 'pointer' : 'default',
                  }}
                >
                  {/* Avatar */}
                  {r.driver.avatarUrl ? (
                    <img
                      src={r.driver.avatarUrl}
                      alt=""
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: 'rgba(255,255,255,0.5)',
                    }}>
                      {r.driver.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Name + handle */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>
                      {r.driver.displayName}
                    </div>
                    {r.driver.handle && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>@{r.driver.handle}</div>
                    )}
                  </div>

                  {/* Status chip */}
                  <span style={{
                    padding: '3px 10px', borderRadius: 100, flexShrink: 0,
                    background: `${statusColor}22`, color: statusColor,
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                  }}>
                    {STATUS_LABELS[r.status]}
                  </span>

                  {/* Score (notified) */}
                  {r.score != null && (
                    <span style={{
                      fontFamily: "'Space Mono', monospace", fontSize: 12,
                      color: '#FFB300', flexShrink: 0,
                    }}>
                      {r.score.toFixed(3)}
                    </span>
                  )}

                  {/* Response (notified) */}
                  {r.response && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 100, flexShrink: 0,
                      background: `${RESPONSE_COLORS[r.response] ?? '#888'}22`,
                      color: RESPONSE_COLORS[r.response] ?? '#888',
                      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    }}>
                      {r.response.replace('_', ' ').toUpperCase()}
                    </span>
                  )}

                  {/* Expand chevron */}
                  {hasDetail && (
                    <span style={{
                      fontSize: 10, color: 'rgba(255,255,255,0.35)', flexShrink: 0,
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform 200ms',
                    }}>
                      ▼
                    </span>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    padding: '12px 14px',
                  }}>
                    {/* Filter results (in_pool_filtered or in_pool_not_notified) */}
                    {r.filterResults.length > 0 && (
                      <CheckList
                        title="Matching filter results"
                        items={r.filterResults.map((f) => ({
                          label: humanizeFilterName(f.filter ?? 'unknown'),
                          passed: f.passed !== false,
                          detail: formatFilterDetail(f),
                        }))}
                      />
                    )}

                    {/* Pre-pool checks (not_in_pool) */}
                    {r.prePoolChecks.length > 0 && (
                      <CheckList
                        title="Why this driver wasn't in the pool"
                        items={r.prePoolChecks}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CheckList({ title, items }: { title: string; items: PrePoolCheck[] }) {
  const passed = items.filter((i) => i.passed).length;
  const total = items.length;
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)',
        letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
      }}>
        {title} — {passed}/{total} passed
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 13, lineHeight: 1.4,
          }}>
            <span style={{
              flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: item.passed ? 'rgba(0,230,118,0.15)' : 'rgba(255,68,68,0.15)',
              color: item.passed ? '#00E676' : '#FF8A8A',
              fontSize: 10, fontWeight: 900,
            }}>
              {item.passed ? '✓' : '✗'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: item.passed ? 'rgba(255,255,255,0.8)' : '#FF8A8A', fontWeight: 600 }}>
                {item.label}
              </span>
              {item.detail && (
                <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 8, fontSize: 12 }}>
                  {item.detail}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function humanizeFilterName(name: string): string {
  const MAP: Record<string, string> = {
    max_proximity_km: 'Distance from pickup',
    min_rating: 'Minimum rating',
    min_chill_score: 'Chill score',
    min_completed_rides: 'Completed rides',
    has_active_ride: 'Not on an active ride',
    is_available: 'Driver availability',
    sex_match: 'Gender preference',
    has_stripe_account: 'Payout account',
    account_status: 'Account status',
    location_stale: 'Location freshness',
  };
  return MAP[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFilterDetail(f: FilterResult): string {
  if (f.passed !== false) return '';
  const val = f.value;
  const threshold = f.threshold;
  switch (f.filter) {
    case 'max_proximity_km':
      return `${typeof val === 'number' ? val.toFixed(1) : val}km from pickup (max ${threshold}km)`;
    case 'min_rating':
      return `Rating ${val} (min ${threshold})`;
    case 'min_chill_score':
      return `Score ${val} (min ${threshold})`;
    case 'min_completed_rides':
      return `${val} rides (min ${threshold})`;
    case 'has_active_ride':
      return 'Driver is currently on a ride';
    case 'is_available':
      return 'Driver set themselves unavailable';
    case 'sex_match':
      return "Rider preference mismatch";
    case 'has_stripe_account':
      return 'No connected payout account';
    case 'account_status':
      return `Account is "${val}" (need active)`;
    case 'location_stale':
      return `GPS ${typeof val === 'number' ? Math.round(val / 60) + 'min old' : val}`;
    default:
      return threshold !== undefined ? `${val} (threshold: ${threshold})` : String(val ?? '');
  }
}
