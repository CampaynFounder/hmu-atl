'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMarket } from '@/app/admin/components/market-context';
import SafetyEventCard, { type SafetyEventRow, EVENT_LABEL } from '@/components/admin/safety/safety-event-card';
import SafetySubNav from '@/components/admin/safety/safety-subnav';
import type { SafetyEventType, SafetyEventSeverity, SafetyParty } from '@/lib/db/types';

const PAGE_SIZE = 25;

const EVENT_TYPE_OPTIONS: Array<{ value: '' | SafetyEventType; label: string }> = [
  { value: '', label: 'All types' },
  ...(Object.entries(EVENT_LABEL) as Array<[SafetyEventType, string]>).map(([value, label]) => ({ value, label })),
];
const SEVERITY_OPTIONS: Array<{ value: '' | SafetyEventSeverity; label: string }> = [
  { value: '', label: 'Any severity' },
  { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' },
  { value: 'warn', label: 'Warn' }, { value: 'info', label: 'Info' },
];
const PARTY_OPTIONS: Array<{ value: '' | SafetyParty; label: string }> = [
  { value: '', label: 'Any party' }, { value: 'rider', label: 'Rider' },
  { value: 'driver', label: 'Driver' }, { value: 'system', label: 'System' },
];
const RESOLVED_OPTIONS: Array<{ value: '' | 'true' | 'false'; label: string }> = [
  { value: '', label: 'Open + Resolved' },
  { value: 'false', label: 'Only open' },
  { value: 'true', label: 'Only resolved' },
];

export function SafetyArchive() {
  const [events, setEvents] = useState<SafetyEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Filters — local state (pending) separated from applied state so typing in
  // the search doesn't debounce-fire a query per keystroke. Apply happens on
  // form submit / Enter.
  const [q, setQ] = useState('');
  const [eventType, setEventType] = useState<'' | SafetyEventType>('');
  const [severity, setSeverity] = useState<'' | SafetyEventSeverity>('');
  const [party, setParty] = useState<'' | SafetyParty>('');
  const [resolved, setResolved] = useState<'' | 'true' | 'false'>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Bump on every filter apply so effect refetches fresh.
  const appliedRef = useRef(0);
  const [applied, setApplied] = useState(0);
  const { selectedMarketId } = useMarket();

  const fetchPage = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        scope: 'all',
        limit: String(PAGE_SIZE),
        offset: String(reset ? 0 : offset),
      });
      if (q) params.set('q', q);
      if (eventType) params.set('event_type', eventType);
      if (severity) params.set('severity', severity);
      if (party) params.set('party', party);
      if (resolved) params.set('resolved', resolved);
      if (selectedMarketId) params.set('market_id', selectedMarketId);
      if (startDate) params.set('start_date', new Date(startDate).toISOString());
      if (endDate) {
        // end of day (inclusive of the whole endDate day)
        const end = new Date(endDate); end.setHours(23, 59, 59, 999);
        params.set('end_date', end.toISOString());
      }
      const res = await fetch(`/api/admin/safety?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      const newRows: SafetyEventRow[] = data.events ?? [];
      const pg = data.pagination ?? { total: newRows.length, hasMore: false };
      setEvents((prev) => reset ? newRows : [...prev, ...newRows]);
      setTotal(pg.total ?? 0);
      setHasMore(!!pg.hasMore);
      setOffset((reset ? 0 : offset) + newRows.length);
    } finally {
      setLoading(false);
    }
  }, [q, eventType, severity, party, resolved, startDate, endDate, offset, selectedMarketId]);

  // Initial load + every filter apply + market switch.
  useEffect(() => {
    appliedRef.current = applied;
    setOffset(0);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, selectedMarketId]);

  const apply = () => setApplied((n) => n + 1);

  const clearFilters = () => {
    setQ(''); setEventType(''); setSeverity(''); setParty('');
    setResolved(''); setStartDate(''); setEndDate('');
    setApplied((n) => n + 1);
  };

  return (
    <div style={{ padding: '20px', color: 'var(--admin-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Safety · Archive</h1>
        <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
          {total} event{total === 1 ? '' : 's'} match
        </span>
      </div>

      <SafetySubNav />

      <form
        onSubmit={(e) => { e.preventDefault(); apply(); }}
        style={{
          background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
          borderRadius: 12, padding: 14, marginBottom: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search rider/driver name or ride ID prefix…"
          style={{
            padding: '10px 14px', fontSize: 14, borderRadius: 10,
            background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
            color: 'var(--admin-text)', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Select value={eventType} onChange={setEventType} options={EVENT_TYPE_OPTIONS} />
          <Select value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} />
          <Select value={party} onChange={setParty} options={PARTY_OPTIONS} />
          <Select value={resolved} onChange={setResolved} options={RESOLVED_OPTIONS} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={labelStyle}>
            <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>From</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>To</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" onClick={clearFilters} style={clearBtnStyle}>Clear</button>
            <button type="submit" style={applyBtnStyle}>Apply</button>
          </div>
        </div>
      </form>

      {loading && events.length === 0 && (
        <div style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>Loading…</div>
      )}
      {!loading && events.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--admin-text-muted)',
          background: 'var(--admin-bg-elevated)', borderRadius: 16, fontSize: 14,
        }}>
          No events match these filters.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((e) => (
          <SafetyEventCard
            key={e.id}
            event={e}
            onResolved={() => {
              // Optimistic: refetch the full page so totals + ordering stay accurate.
              setApplied((n) => n + 1);
            }}
          />
        ))}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => fetchPage(false)}
            disabled={loading}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 600, borderRadius: 999,
              background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
              color: 'var(--admin-text)', cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Loading…' : `Load ${Math.min(PAGE_SIZE, total - events.length)} more`}
          </button>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2,
};
const inputStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 12, fontWeight: 600,
  background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
  borderRadius: 8, color: 'var(--admin-text)',
};
const clearBtnStyle: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8,
  background: 'transparent', border: '1px solid var(--admin-border)',
  color: 'var(--admin-text-secondary)', cursor: 'pointer',
};
const applyBtnStyle: React.CSSProperties = {
  padding: '8px 18px', fontSize: 12, fontWeight: 700, borderRadius: 8,
  background: '#00E676', color: '#080808', border: 'none', cursor: 'pointer',
};

function Select<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      style={{ ...inputStyle, cursor: 'pointer' }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
